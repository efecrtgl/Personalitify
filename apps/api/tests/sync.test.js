import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  createApiClient,
  createMemoryTokenStore,
  createSyncReplica,
} from '../../../packages/api-client/src/index.js';
import { runJob } from '../src/core/jobs.js';
import { SyncCounter, SyncEvent } from '../src/modules/events/sync-event.model.js';
import '../src/modules/sync/sync.jobs.js';
import { pruneHistory } from '../src/modules/sync/sync.service.js';
import { Task } from '../src/modules/tasks/task.model.js';
import { loginUser, registerUser, serverUrl } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const DAY = 86_400_000;

/**
 * A device with a copy of its own: the real API client, signed in as `session`, and the
 * reference replica on top of it. Everything it knows came over the network.
 */
async function deviceOf(session) {
  const tokenStore = createMemoryTokenStore();
  tokenStore.setTokens(session.tokens);
  const api = createApiClient({
    baseUrl: serverUrl(),
    tokenStore,
    getLanguage: () => 'en',
  });
  const replica = createSyncReplica({ sync: api.sync });
  return { api, replica, session };
}

const post = async (user, path, body) => (await user.post(path, body).expect(201)).body.data;
const titles = (replica) =>
  replica
    .all('task')
    .map((task) => task.title)
    .sort();

describe('synchronization', () => {
  useTestDatabase();

  it('copies an account from a snapshot, page by page', async () => {
    const user = await registerUser();
    const category = await post(user, '/categories', { name: 'Work', color: '#0a84ff' });
    const habit = await post(user, '/habits', { name: 'Read', color: '#5e5ce6' });
    const today = (await user.get('/tasks/day').expect(200)).body.data.today;
    await user.put(`/habits/${habit.id}/entries/${today}`, { value: 1 }).expect(200);
    const tasks = [];
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      tasks.push(await post(user, '/tasks', { title, categoryId: category.id }));
    }
    await user.delete(`/tasks/${tasks[4].id}`).expect(204);

    const manifest = (await user.get('/sync/snapshot').expect(200)).body.data;
    const counts = Object.fromEntries(manifest.types.map((type) => [type.entityType, type.count]));
    expect(counts).toMatchObject({
      profile: 1,
      settings: 1,
      category: 1,
      habit: 1,
      habitEntry: 1,
      task: 4,
      goal: 0,
    });
    expect(manifest.cursor).toBeGreaterThan(0);

    // Pages are ordered by id and end with `next: null`; deleted entities are not in them.
    const first = (await user.get('/sync/snapshot/task?limit=3').expect(200)).body.data;
    expect(first.items).toHaveLength(3);
    expect(first.next).toBe(first.items[2].id);
    const second = (await user.get(`/sync/snapshot/task?limit=3&after=${first.next}`).expect(200))
      .body.data;
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).not.toContain(tasks[4].id);
    const unknown = (await user.get('/sync/snapshot/spaceship').expect(422)).body.error;
    expect(unknown).toMatchObject({
      code: 'UNKNOWN_ENTITY_TYPE',
      details: { entityType: 'spaceship' },
    });

    // The reference replica does all of that and ends up with what the API shows.
    const { replica } = await deviceOf(user);
    const result = await replica.bootstrap();
    expect(result.restarted).toBe(false);
    expect(replica.getCursor()).toBe(manifest.cursor);
    expect(titles(replica)).toEqual(['Four', 'One', 'Three', 'Two']);
    expect(replica.get('category', category.id)).toEqual(category);
    expect(replica.all('habitEntry')).toMatchObject([{ habitId: habit.id, date: today }]);
    expect(replica.all('settings')[0]).toEqual((await user.get('/settings').expect(200)).body.data);
    const listed = (await user.get('/tasks?limit=100').expect(200)).body.data;
    expect(replica.all('task').sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      listed.sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it('pulls the newest state of what changed, with tombstones, and remembers the position', async () => {
    const user = await registerUser();
    const { replica } = await deviceOf(user);
    await replica.bootstrap();
    const start = replica.getCursor();

    const kept = await post(user, '/tasks', { title: 'Draft' });
    await user.patch(`/tasks/${kept.id}`, { title: 'Draft 2' }).expect(200);
    await user.patch(`/tasks/${kept.id}`, { title: 'Final', priority: 'high' }).expect(200);
    const gone = await post(user, '/tasks', { title: 'Mistake' });
    await user.delete(`/tasks/${gone.id}`).expect(204);
    const other = await post(user, '/tasks', { title: 'Another' });

    // Six events, three entities: each appears once, in its newest state.
    const changes = (await user.get(`/sync/changes?cursor=${start}`).expect(200)).body.data;
    expect(changes.changes).toHaveLength(3);
    expect(
      changes.changes.map((change) => [change.entityId, change.version, change.deleted]),
    ).toEqual([
      [kept.id, 3, false],
      [gone.id, 2, true],
      [other.id, 1, false],
    ]);
    expect(changes.changes[0].data).toMatchObject({ title: 'Final', priority: 'high', version: 3 });
    expect(changes.changes[1].data).toBeNull();
    expect(changes).toMatchObject({ cursor: start + 6, headSeq: start + 6, hasMore: false });
    expect(changes.changes.map((change) => change.seq)).toEqual([start + 3, start + 5, start + 6]);

    // In small steps the same changes arrive; the cursor of each answer continues the next.
    const firstStep = (await user.get(`/sync/changes?cursor=${start}&limit=2`).expect(200)).body
      .data;
    expect(firstStep).toMatchObject({ cursor: start + 2, hasMore: true });
    expect(firstStep.changes).toMatchObject([{ entityId: kept.id, version: 2 }]);

    const pulled = await replica.pull();
    expect(pulled).toMatchObject({ applied: 3, cursor: start + 6, restarted: false });
    expect(titles(replica)).toEqual(['Another', 'Final']);
    expect(replica.get('task', gone.id)).toBeUndefined();
    expect(await replica.pull()).toMatchObject({ applied: 0, cursor: start + 6 });

    // The device's position is confirmed and visible.
    const status = (await user.get('/sync/status').expect(200)).body.data;
    expect(status).toMatchObject({
      headSeq: start + 6,
      oldestCursor: 0,
      retentionDays: 90,
      device: { id: user.tokens.deviceId, cursor: start + 6, behind: 0, canCatchUp: true },
    });
    expect(status.device.lastSyncAt).not.toBeNull();
    const device = (await user.get('/devices/current').expect(200)).body.data;
    expect(device.syncCursor).toBe(start + 6);
    // A position never moves back, and cannot be ahead of the log.
    expect((await user.post('/sync/ack', { cursor: 1 }).expect(200)).body.data.device.cursor).toBe(
      start + 6,
    );
    await user.post('/sync/ack', { cursor: start + 999 }).expect(400);
    await user.get('/sync/changes?cursor=-1').expect(400);
    await user.get('/sync/changes?limit=1001').expect(400);
  });

  it('brings two devices to the same state, whoever changes what', async () => {
    const user = await registerUser();
    const desktop = await deviceOf(user);
    const phone = await deviceOf(await loginUser(user.credentials));
    await desktop.replica.bootstrap();
    await phone.replica.bootstrap();

    // Online change on the desktop; the phone pulls it.
    const task = await post(user, '/tasks', { title: 'Buy milk' });
    await phone.replica.pull();
    expect(phone.replica.get('task', task.id)).toMatchObject({ title: 'Buy milk', version: 1 });

    // The phone goes offline: it finishes the task, renames it and adds another one.
    const newId = randomUUID();
    phone.replica.enqueue({ method: 'POST', path: `/tasks/${task.id}/complete` });
    phone.replica.enqueue({
      method: 'PATCH',
      path: `/tasks/${task.id}`,
      body: { title: 'Buy oat milk' },
    });
    phone.replica.enqueue({ method: 'POST', path: '/tasks', body: { id: newId, title: 'Bread' } });
    expect(phone.replica.pending()).toHaveLength(3);

    // Back online.
    const outcomes = await phone.replica.flush();
    expect(outcomes.map((outcome) => [outcome.status, outcome.ok, outcome.replayed])).toEqual([
      [200, true, false],
      [200, true, false],
      [201, true, false],
    ]);
    expect(outcomes[2].data).toMatchObject({ id: newId, title: 'Bread', version: 1 });
    expect(phone.replica.pending()).toEqual([]);

    await phone.replica.pull();
    await desktop.replica.pull();
    for (const { replica } of [desktop, phone]) {
      expect(replica.get('task', task.id)).toMatchObject({ title: 'Buy oat milk', status: 'done' });
      expect(replica.get('task', newId)).toMatchObject({ title: 'Bread' });
    }
    expect(desktop.replica.all('task')).toEqual(phone.replica.all('task'));
    expect(desktop.replica.getCursor()).toBe(phone.replica.getCursor());

    // A deletion on one device removes the entity on the other.
    await user.delete(`/tasks/${newId}`).expect(204);
    await phone.replica.pull();
    expect(phone.replica.get('task', newId)).toBeUndefined();

    // The events caused by pushed operations say which operation and which device.
    const log = (await user.get('/events?limit=500').expect(200)).body.data;
    const created = log.find((event) => event.event === 'task.created' && event.entityId === newId);
    expect(created.originDeviceId).toBe(phone.session.tokens.deviceId);
    expect(created.opId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('carries out an operation once, however often it is sent', async () => {
    const user = await registerUser();
    const { api } = await deviceOf(user);
    const id = randomUUID();
    const batch = [
      { opId: randomUUID(), method: 'POST', path: '/tasks', body: { id, title: 'Once' } },
      { opId: randomUUID(), method: 'POST', path: `/tasks/${id}/complete` },
    ];

    const first = await api.sync.push(batch);
    expect(first.results.map((result) => result.replayed)).toEqual([false, false]);
    const headAfterFirst = first.cursor;

    // The answer was lost on the way; the client sends the same batch again — twice.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const again = await api.sync.push(batch);
      expect(again.results.map((result) => result.replayed)).toEqual([true, true]);
      expect(again.results.map(({ replayed, ...rest }) => rest)).toEqual(
        first.results.map(({ replayed, ...rest }) => rest),
      );
      expect(again.cursor).toBe(headAfterFirst);
    }
    expect(await Task.countDocuments({ userId: user.userId })).toBe(1);
    expect((await user.get(`/tasks/${id}`).expect(200)).body.data).toMatchObject({
      title: 'Once',
      status: 'done',
      version: 2,
    });

    // An id stands for one operation: using it for another one is refused.
    const reused = await api.sync.push([
      {
        opId: batch[0].opId,
        method: 'POST',
        path: '/categories',
        body: { name: 'X', color: '#0a84ff' },
      },
    ]);
    expect(reused.results[0]).toMatchObject({
      status: 409,
      ok: false,
      error: { code: 'CONFLICT', details: { reason: 'operation_id_reused' } },
    });
    expect((await user.get('/categories').expect(200)).body.data).toEqual([]);

    // The same id twice in one request, an empty request and an oversized one are invalid.
    const twice = { opId: randomUUID(), method: 'POST', path: '/tasks', body: { title: 'A' } };
    await user.post('/sync/push', { operations: [twice, twice] }).expect(400);
    await user.post('/sync/push', { operations: [] }).expect(400);
    await user
      .post('/sync/push', {
        operations: Array.from({ length: 101 }, () => ({
          opId: randomUUID(),
          method: 'POST',
          path: '/tasks',
          body: { title: 'A' },
        })),
      })
      .expect(400);
  });

  it('merges offline edits of different fields and reports real conflicts', async () => {
    const user = await registerUser();
    const desktop = await deviceOf(user);
    const phone = await deviceOf(await loginUser(user.credentials));
    const task = await post(user, '/tasks', { title: 'Report', priority: 'low' });
    const doomed = await post(user, '/tasks', { title: 'Doomed' });
    await phone.replica.bootstrap();
    await desktop.replica.bootstrap();

    // While the phone is offline, the desktop renames one task and deletes the other.
    await user.patch(`/tasks/${task.id}`, { title: 'Annual report', baseVersion: 1 }).expect(200);
    await user.delete(`/tasks/${doomed.id}`).expect(204);

    // The phone, still at version 1, changed the priority, the title, and the deleted task.
    phone.replica.enqueue({
      method: 'PATCH',
      path: `/tasks/${task.id}`,
      body: { priority: 'high', baseVersion: 1 },
    });
    phone.replica.enqueue({
      method: 'PATCH',
      path: `/tasks/${task.id}`,
      body: { title: 'Quarterly report', baseVersion: 1 },
    });
    phone.replica.enqueue({
      method: 'PATCH',
      path: `/tasks/${doomed.id}`,
      body: { title: 'Still here?', baseVersion: 1 },
    });
    phone.replica.enqueue({
      method: 'POST',
      path: '/tasks',
      body: { title: 'After the conflict' },
    });

    const [priority, title, deleted, later] = await phone.replica.flush();
    // A different field: merged on top of the desktop's change.
    expect(priority).toMatchObject({ status: 200, ok: true });
    expect(priority.data).toMatchObject({ title: 'Annual report', priority: 'high', version: 3 });
    // The same field: refused, with the current entity to decide from.
    expect(title).toMatchObject({
      status: 409,
      ok: false,
      error: {
        code: 'VERSION_CONFLICT',
        details: {
          entityType: 'task',
          entityId: task.id,
          conflictingFields: ['title'],
          currentVersion: 3,
        },
      },
    });
    expect(title.error.details.current).toMatchObject({ title: 'Annual report', priority: 'high' });
    // Deleted elsewhere: gone. Deletion wins over a later edit.
    expect(deleted).toMatchObject({ status: 404, ok: false, error: { code: 'NOT_FOUND' } });
    // One refused operation does not hold up the ones behind it.
    expect(later).toMatchObject({ status: 201, ok: true });
    expect(phone.replica.pending()).toEqual([]);

    await phone.replica.pull();
    await desktop.replica.pull();
    expect(titles(phone.replica)).toEqual(['After the conflict', 'Annual report']);
    expect(desktop.replica.all('task')).toEqual(phone.replica.all('task'));
  });

  it('accepts every data operation of the API and nothing else', async () => {
    const user = await registerUser();
    const other = await registerUser();
    const theirs = await post(other, '/tasks', { title: 'Not yours' });
    const { api } = await deviceOf(user);
    const today = (await user.get('/tasks/day').expect(200)).body.data.today;
    const habitId = randomUUID();
    const goalId = randomUUID();
    const op = (method, path, body) => ({
      opId: randomUUID(),
      method,
      path,
      ...(body ? { body } : {}),
    });

    const { results } = await api.sync.push([
      op('POST', '/habits', { id: habitId, name: 'Read', color: '#5e5ce6' }),
      op('PUT', `/habits/${habitId}/entries/${today}`, { value: 1 }),
      op('POST', '/goals', { id: goalId, title: 'Marathon', color: '#30d158' }),
      op('POST', `/goals/${goalId}/milestones`, { title: '5 km' }),
      op('PUT', `/mood/${today}`, { score: 4 }),
      op('POST', '/journal', { title: 'Offline thoughts' }),
      op('POST', '/focus/sessions', { plannedMinutes: 25 }),
      op('PATCH', '/settings', { theme: 'dark' }),
      // Invalid input is refused like the request would be, and the rest continues.
      op('POST', '/tasks', { title: '' }),
      op('POST', '/tasks', { title: 'Valid' }),
      // Not data operations.
      op('POST', '/auth/logout'),
      op('DELETE', '/account', { password: 'whatever' }),
      op('POST', '/sync/ack', { cursor: 0 }),
      op('DELETE', `/devices/${user.tokens.deviceId}`),
      // Not a route at all, and somebody else's record.
      op('POST', '/nonsense'),
      op('PATCH', `/tasks/${theirs.id}`, { title: 'Mine now' }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      201, 200, 201, 201, 200, 201, 201, 200, 400, 201, 403, 403, 403, 403, 404, 404,
    ]);
    expect(results[8].error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(results[8].error.details[0]).toMatchObject({ path: 'title' });
    expect(results[10].error).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'not_pushable' },
    });
    expect(results[14].error.code).toBe('ROUTE_NOT_FOUND');
    expect(results[15].error.code).toBe('NOT_FOUND');

    // The session survived the refused sign-out, and the data operations took effect.
    expect((await user.get('/settings').expect(200)).body.data.theme).toBe('dark');
    expect((await user.get('/focus').expect(200)).body.data.session).toMatchObject({
      status: 'running',
    });
    expect(results[3].data.milestones).toMatchObject([{ title: '5 km', done: false }]);
    expect((await other.get(`/tasks/${theirs.id}`).expect(200)).body.data.title).toBe('Not yours');

    // Reading is not pushing.
    await user
      .post('/sync/push', { operations: [{ opId: randomUUID(), method: 'GET', path: '/tasks' }] })
      .expect(400);
    await user
      .post('/sync/push', {
        operations: [
          { opId: randomUUID(), method: 'POST', path: '/tasks?x=1', body: { title: 'A' } },
        ],
      })
      .expect(400);
  });

  it('pulls a long absence in steps', async () => {
    const user = await registerUser();
    const { replica, api } = await deviceOf(user);
    await replica.bootstrap();
    const start = replica.getCursor();
    await api.sync.push(
      Array.from({ length: 60 }, (_, index) => ({
        opId: randomUUID(),
        method: 'POST',
        path: '/tasks',
        body: { title: `Task ${String(index).padStart(2, '0')}` },
      })),
    );

    const step = (await user.get(`/sync/changes?cursor=${start}&limit=25`).expect(200)).body.data;
    expect(step.changes).toHaveLength(25);
    expect(step).toMatchObject({ cursor: start + 25, hasMore: true });

    const pulled = await replica.pull();
    expect(pulled.applied).toBe(60);
    expect(replica.all('task')).toHaveLength(60);
    expect(replica.getCursor()).toBe(start + 60);
  });

  it('forgets old history and lets a device that was away too long start again', async () => {
    const user = await registerUser();
    const desktop = await deviceOf(user);
    const phone = await deviceOf(await loginUser(user.credentials));
    const kept = await post(user, '/tasks', { title: 'Kept' });
    const removed = await post(user, '/tasks', { title: 'Removed' });
    await phone.replica.bootstrap();
    await desktop.replica.bootstrap();
    const oldCursor = phone.replica.getCursor();

    // The phone is switched off. Life goes on.
    await user.delete(`/tasks/${removed.id}`).expect(204);
    await user.patch(`/tasks/${kept.id}`, { title: 'Kept and changed' }).expect(200);
    const headBefore = (await user.get('/sync/status').expect(200)).body.data.headSeq;
    expect(await Task.countDocuments({ _id: removed.id })).toBe(1); // the tombstone

    // Nothing is old enough yet.
    expect(await pruneHistory(new Date(Date.now() + 89 * DAY))).toEqual({
      events: 0,
      tombstones: 0,
    });
    // Ninety-one days later the history and the tombstone are gone.
    const pruned = await runJob('sync-retention', { now: new Date(Date.now() + 91 * DAY) });
    expect(pruned.ran).toBe(true);
    expect(pruned.result.events).toBeGreaterThanOrEqual(headBefore);
    expect(pruned.result.tombstones).toBeGreaterThanOrEqual(1);
    expect(await SyncEvent.countDocuments({ userId: user.userId })).toBe(0);
    expect(await Task.countDocuments({ _id: removed.id })).toBe(0);
    expect((await SyncCounter.findById(user.userId).lean()).prunedThrough).toBe(headBefore);

    // The phone's position is older than the history: it is told so.
    const expired = (await user.get(`/sync/changes?cursor=${oldCursor}`).expect(410)).body.error;
    expect(expired).toMatchObject({
      code: 'CURSOR_EXPIRED',
      details: { cursor: oldCursor, oldestCursor: headBefore, headSeq: headBefore },
    });
    const status = (await phone.api.sync.status()).device;
    expect(status).toMatchObject({ cursor: oldCursor, canCatchUp: false });
    // A position the log never reached is refused the same way.
    await user.get(`/sync/changes?cursor=${headBefore + 50}`).expect(410);

    // The replica starts again from a snapshot by itself and ends up correct.
    const result = await phone.replica.pull();
    expect(result.restarted).toBe(true);
    expect(titles(phone.replica)).toEqual(['Kept and changed']);
    expect(phone.replica.getCursor()).toBe(headBefore);

    // The desktop was up to date: it carries on from where it was.
    await desktop.replica.pull();
    expect((await desktop.replica.pull()).restarted).toBe(false);

    // The log continues with the next number; nothing restarts at one.
    const next = await post(user, '/tasks', { title: 'After the purge' });
    const changes = (await user.get(`/sync/changes?cursor=${headBefore}`).expect(200)).body.data;
    expect(changes.changes).toMatchObject([{ seq: headBefore + 1, entityId: next.id }]);
    await phone.replica.pull();
    await desktop.replica.pull();
    expect(desktop.replica.all('task')).toEqual(phone.replica.all('task'));
  });

  it('keeps a replica’s state across a restart, queue included', async () => {
    const user = await registerUser();
    const first = await deviceOf(user);
    await first.replica.bootstrap();
    await post(user, '/tasks', { title: 'Online' });
    first.replica.enqueue({ method: 'POST', path: '/tasks', body: { title: 'Queued' } });
    const saved = JSON.parse(JSON.stringify(first.replica.dump()));

    // The app is closed and opened again.
    const second = await deviceOf(user);
    second.replica.restore(saved);
    expect(second.replica.pending()).toHaveLength(1);
    expect(second.replica.getCursor()).toBe(saved.cursor);
    await second.replica.flush();
    await second.replica.pull();
    expect(titles(second.replica)).toEqual(['Online', 'Queued']);

    // The first instance never heard the answer and sends its queue too: nothing doubles.
    const outcomes = await first.replica.flush();
    expect(outcomes).toMatchObject([{ replayed: true, status: 201 }]);
    await first.replica.pull();
    expect(titles(first.replica)).toEqual(['Online', 'Queued']);
  });

  it('never shows one account’s data to another', async () => {
    const user = await registerUser();
    const other = await registerUser();
    await post(user, '/tasks', { title: 'Private' });

    const { replica } = await deviceOf(other);
    await replica.bootstrap();
    expect(replica.all('task')).toEqual([]);
    const changes = (await other.get('/sync/changes?cursor=0').expect(200)).body.data;
    expect(changes.changes.every((change) => change.data?.title !== 'Private')).toBe(true);
    const page = (await other.get('/sync/snapshot/task').expect(200)).body.data;
    expect(page.items).toEqual([]);
    expect(mongoose.connection.readyState).toBe(1);
  });
});
