import { describe, expect, it, vi } from 'vitest';
import { createSyncReplica } from '../src/index.js';

const task = (id, version, title) => ({ id, version, title });
const change = (seq, entity, deleted = false) => ({
  seq,
  entityType: 'task',
  entityId: entity.id,
  version: entity.version,
  deleted,
  data: deleted ? null : entity,
});

/** A scripted `sync` namespace. */
function fakeSync(overrides = {}) {
  let ids = 0;
  return {
    createId: () => `op-${(ids += 1)}`,
    sync: {
      snapshot: vi.fn(async () => ({ cursor: 10, types: [{ entityType: 'task', count: 0 }] })),
      snapshotPage: vi.fn(async () => ({ entityType: 'task', items: [], next: null })),
      changes: vi.fn(async ({ cursor }) => ({
        changes: [],
        cursor,
        headSeq: cursor,
        hasMore: false,
      })),
      ack: vi.fn(async () => ({})),
      push: vi.fn(async (operations) => ({
        results: operations.map(({ opId }) => ({ opId, status: 200, ok: true, replayed: false })),
        cursor: 0,
      })),
      ...overrides,
    },
  };
}

describe('sync replica', () => {
  it('copies page by page, then applies what changed since the copy began', async () => {
    const pages = [
      { entityType: 'task', items: [task('a', 1, 'A'), task('b', 1, 'B')], next: 'b' },
      { entityType: 'task', items: [task('c', 1, 'C')], next: null },
    ];
    const { sync } = fakeSync({
      snapshotPage: vi.fn(async () => pages.shift()),
      // While the pages were fetched, `b` was renamed and `c` deleted.
      changes: vi.fn(async () => ({
        changes: [change(11, task('b', 2, 'B2')), change(12, task('c', 2), true)],
        cursor: 12,
        headSeq: 12,
        hasMore: false,
      })),
    });
    const replica = createSyncReplica({ sync });

    expect(await replica.bootstrap()).toEqual({ applied: 2, cursor: 12, restarted: false });
    expect(sync.snapshotPage).toHaveBeenNthCalledWith(2, 'task', { after: 'b' });
    expect(sync.changes).toHaveBeenCalledWith({ cursor: 10 });
    expect(replica.all('task')).toEqual([task('a', 1, 'A'), task('b', 2, 'B2')]);
    expect(sync.ack).toHaveBeenCalledWith(12);
  });

  it('never replaces an entity with an older version', async () => {
    const answers = [
      { changes: [change(1, task('a', 3, 'Newest'))], cursor: 1, headSeq: 2, hasMore: true },
      { changes: [change(2, task('a', 2, 'Older'))], cursor: 2, headSeq: 2, hasMore: false },
    ];
    const { sync } = fakeSync({ changes: vi.fn(async () => answers.shift()) });
    const replica = createSyncReplica({ sync });
    replica.restore({ cursor: 0, entities: {}, queue: [] });

    await replica.pull();
    expect(replica.get('task', 'a').title).toBe('Newest');
    expect(replica.getCursor()).toBe(2);
    expect(sync.ack).toHaveBeenCalledTimes(1);
  });

  it('starts again from a snapshot when its cursor has expired', async () => {
    let expired = true;
    const { sync } = fakeSync({
      changes: vi.fn(async ({ cursor }) => {
        if (expired) {
          expired = false;
          throw Object.assign(new Error('gone'), { code: 'CURSOR_EXPIRED' });
        }
        return { changes: [], cursor, headSeq: cursor, hasMore: false };
      }),
      snapshotPage: vi.fn(async () => ({
        entityType: 'task',
        items: [task('z', 5, 'Z')],
        next: null,
      })),
    });
    const replica = createSyncReplica({ sync });
    replica.restore({ cursor: 3, entities: { task: [task('old', 1, 'Old')] }, queue: [] });

    expect(await replica.pull()).toMatchObject({ restarted: true, cursor: 10 });
    expect(replica.all('task')).toEqual([task('z', 5, 'Z')]);
    // Any other failure is the caller's to handle.
    sync.changes.mockRejectedValueOnce(new Error('offline'));
    await expect(replica.pull()).rejects.toThrow('offline');
  });

  it('keeps the order of the queue when the server cannot answer', async () => {
    let failing = true;
    const { sync, createId } = fakeSync({
      push: vi.fn(async (operations) => ({
        results: operations.map(({ opId }, index) =>
          failing && index === 1
            ? { opId, status: 500, ok: false, replayed: false, error: { code: 'INTERNAL_ERROR' } }
            : { opId, status: index === 0 ? 409 : 200, ok: index !== 0, replayed: false },
        ),
        cursor: 0,
      })),
    });
    const replica = createSyncReplica({ sync, createId });
    for (const title of ['one', 'two', 'three']) {
      replica.enqueue({ method: 'POST', path: '/tasks', body: { title } });
    }

    // The first is answered (refused), the second is not: it and everything behind it stay.
    const first = await replica.flush();
    expect(first.map((outcome) => outcome.opId)).toEqual(['op-1']);
    expect(replica.pending().map((operation) => operation.opId)).toEqual(['op-2', 'op-3']);

    failing = false;
    const second = await replica.flush();
    expect(second.map((outcome) => outcome.opId)).toEqual(['op-2', 'op-3']);
    expect(replica.pending()).toEqual([]);
    // The retry sent the same ids, so the server can recognise them.
    expect(sync.push.mock.calls[1][0].map((operation) => operation.opId)).toEqual(['op-2', 'op-3']);
  });

  it('sends a long queue in batches and survives a restart', async () => {
    const { sync, createId } = fakeSync();
    const replica = createSyncReplica({ sync, createId });
    for (let index = 0; index < 5; index += 1) {
      replica.enqueue({ method: 'DELETE', path: `/tasks/${index}` });
    }
    const saved = JSON.parse(JSON.stringify(replica.dump()));
    expect(saved.queue).toHaveLength(5);
    expect(saved.queue[0]).toEqual({ opId: 'op-1', method: 'DELETE', path: '/tasks/0' });

    const restored = createSyncReplica({ sync, createId });
    restored.restore(saved);
    expect(await restored.flush({ batchSize: 2 })).toHaveLength(5);
    expect(sync.push.mock.calls.map(([operations]) => operations.length)).toEqual([2, 2, 1]);
  });
});
