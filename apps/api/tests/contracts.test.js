import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApiClient,
  createMemoryTokenStore,
  createRealtime,
  createSyncReplica,
} from '../../../packages/api-client/src/index.js';
import { listEntityTypes } from '../src/core/entity/entity-service.js';
import { ENTITY_SCHEMAS, buildJsonSchemas } from '../src/core/json-schemas.js';
import { attachRealtime, closeRealtime } from '../src/modules/realtime/realtime.server.js';
import { getApp, serverUrl } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const schemaDirectory = new URL('../../../docs/api/schemas/', import.meta.url);

async function eventually(check, timeoutMs = 4000) {
  const started = performance.now();
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (performance.now() - started > timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  }
}

describe('published schemas', () => {
  it('are in step with the code (regenerate with `npm run docs:api`)', () => {
    const built = buildJsonSchemas();
    const committed = [
      ...readdirSync(schemaDirectory).filter((name) => name.endsWith('.json')),
      ...readdirSync(new URL('entities/', schemaDirectory)).map((name) => `entities/${name}`),
    ].sort();
    expect(committed).toEqual(Object.keys(built).sort());
    for (const [name, document] of Object.entries(built)) {
      const stored = JSON.parse(readFileSync(new URL(name, schemaDirectory), 'utf8'));
      expect(stored, name).toEqual(JSON.parse(JSON.stringify(document)));
    }
  });

  it('cover every synchronized entity type, each as a standalone document', () => {
    getApp();
    expect(Object.keys(ENTITY_SCHEMAS).sort()).toEqual(listEntityTypes().sort());
    const built = buildJsonSchemas();
    for (const type of listEntityTypes()) {
      const document = built[`entities/${type}.schema.json`];
      expect(document.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(document.$id).toContain(`/entities/${type}.schema.json`);
      expect(document.type).toBe('object');
      // Every entity carries the four fields synchronization relies on.
      expect(document.required).toEqual(
        expect.arrayContaining(['id', 'version', 'createdAt', 'updatedAt']),
      );
    }
    expect(built['index.json'].entities.task).toBe('entities/task.schema.json');
  });
});

/**
 * A client as a native application would be: no cookies, tokens kept by the application,
 * everything it knows fetched through the public API with the published client package.
 */
describe('a native client, end to end', () => {
  useTestDatabase();
  // Closing the realtime server also closes the HTTP server under it: once, at the very end.
  beforeAll(() => {
    attachRealtime(getApp());
  });
  afterAll(() => closeRealtime());

  function nativeClient() {
    const tokenStore = createMemoryTokenStore();
    const ended = [];
    const api = createApiClient({
      baseUrl: serverUrl(),
      tokenStore,
      getLanguage: () => 'en',
      onSessionEnded: (code) => ended.push(code),
    });
    return { api, tokenStore, ended };
  }
  const device = () => ({
    installationId: randomUUID(),
    name: 'Desktop',
    clientType: 'desktop',
    platform: 'windows',
    appId: 'personalitify-desktop',
    appVersion: '1.0.0',
  });

  it('signs in, keeps its session alive with the refresh token and signs out', async () => {
    const { api, tokenStore, ended } = nativeClient();
    const email = `native-${randomUUID()}@example.test`;
    const registered = await api.auth.register({
      email,
      password: 'correct horse battery',
      displayName: 'Native',
      device: device(),
    });
    // A native client receives its refresh token in the body, not in a cookie.
    expect(registered.tokens.refreshToken).toEqual(expect.any(String));
    expect(tokenStore.getRefreshToken()).toBe(registered.tokens.refreshToken);
    expect((await api.users.me()).user.email).toBe(email);

    // The access token is lost (as after a restart with only the refresh token stored):
    // the next request is refused, the client refreshes once and repeats it.
    const firstRefresh = tokenStore.getRefreshToken();
    tokenStore.setTokens({
      accessToken: 'expired-or-missing',
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      refreshToken: firstRefresh,
      sessionId: registered.tokens.sessionId,
      deviceId: registered.tokens.deviceId,
    });
    expect((await api.users.me()).user.email).toBe(email);
    // Refresh tokens are single-use: a new one replaced the old.
    expect(tokenStore.getRefreshToken()).not.toBe(firstRefresh);
    expect(tokenStore.getAccessToken()).not.toBe('expired-or-missing');

    await api.auth.logout();
    expect(tokenStore.getAccessToken()).toBeNull();
    await expect(api.users.me()).rejects.toMatchObject({ status: 401 });
    expect(ended).toEqual([]);

    // Signing in again on the same device works with the password.
    const again = await api.auth.login({
      email,
      password: 'correct horse battery',
      device: device(),
    });
    expect(again.user.email).toBe(email);
  });

  it('holds real data of every entity type in the published shapes', async () => {
    const { api } = nativeClient();
    await api.auth.register({
      email: `shapes-${randomUUID()}@example.test`,
      password: 'correct horse battery',
      displayName: 'Shapes',
      device: device(),
    });
    const { today } = await api.tasks.day();

    // One of everything, made through the client.
    const category = await api.categories.create({ name: 'Work', color: '#0a84ff' });
    const habit = await api.habits.create({
      name: 'Read',
      color: '#5e5ce6',
      categoryId: category.id,
      reminders: [{ time: '09:00', enabled: true }],
    });
    await api.habits.setEntry(habit.id, today, { value: 1 });
    const goal = await api.goals.create({
      title: 'Marathon',
      color: '#30d158',
      habitIds: [habit.id],
    });
    await api.goals.addMilestone(goal.id, { title: '5 km' });
    const task = await api.tasks.create({
      title: 'Report',
      dueDate: today,
      dueTime: '15:00',
      goalId: goal.id,
      subtasks: [{ title: 'Draft' }],
      recurrence: { frequency: 'weekly', weekdays: [1, 3] },
    });
    await api.tasks.complete(task.id);
    await api.calendar.createEvent({
      title: 'Review',
      startDate: today,
      startTime: '10:00',
      endTime: '11:00',
      reminderMinutes: [15],
      recurrence: { frequency: 'daily' },
    });
    const session = await api.focus.start({ plannedMinutes: 25, taskId: null });
    await api.focus.cancel(session.id);
    await api.journal.create({ title: 'Day one', body: '# Hello', tags: ['first'] });
    await api.mood.set(today, { score: 4, emotions: ['calm'] });

    // The achievement and its notification are made by the server.
    const replica = createSyncReplica({ sync: api.sync });
    await eventually(async () => {
      await replica.bootstrap();
      expect(replica.all('notification').length).toBeGreaterThan(0);
    });

    // Every entity of every type has the published shape …
    const seen = {};
    for (const [type, schema] of Object.entries(ENTITY_SCHEMAS)) {
      const entities = replica.all(type);
      seen[type] = entities.length;
      for (const entity of entities) {
        const result = schema.safeParse(entity);
        expect(result.success, `${type}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      }
    }
    expect(Object.entries(seen).filter(([, count]) => count === 0)).toEqual([]);

    // … and so does the `data` of every event about it, tombstones aside.
    const { items: events } = await api.events.list({ limit: 500 });
    expect(events.length).toBeGreaterThan(10);
    for (const event of events) {
      if (event.event.endsWith('.deleted')) {
        expect(Object.keys(event.data).sort()).toEqual(['deletedAt', 'id', 'version']);
        continue;
      }
      const result = ENTITY_SCHEMAS[event.entityType].safeParse(event.data);
      expect(result.success, `${event.event}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      expect(event.data.version).toBe(event.entityVersion);
      expect(event.data.id).toBe(event.entityId);
    }
  });

  it('follows the account live and catches up after being offline', async () => {
    {
      const { api, tokenStore } = nativeClient();
      const credentials = {
        email: `live-${randomUUID()}@example.test`,
        password: 'correct horse battery',
      };
      await api.auth.register({ ...credentials, displayName: 'Live', device: device() });
      const replica = createSyncReplica({ sync: api.sync });
      await replica.bootstrap();

      // A second device of the same account makes the changes.
      const other = nativeClient();
      await other.api.auth.login({ ...credentials, device: device() });

      const received = [];
      const realtime = createRealtime({
        url: serverUrl(),
        getToken: () => api.http.getFreshAccessToken(),
        cursor: replica.getCursor(),
        onEvent: (event) => received.push(event),
      });
      realtime.connect();
      try {
        await eventually(() => expect(realtime.isConnected()).toBe(true));
        const created = await other.api.tasks.create({ title: 'From the other device' });
        await eventually(() =>
          expect(received.map((event) => event.entityId)).toContain(created.id),
        );
        expect(received.at(-1).originDeviceId).toBe(other.tokenStore.getSession().deviceId);
        expect(received.at(-1).originDeviceId).not.toBe(tokenStore.getSession().deviceId);

        // Offline: the connection is gone while two more changes happen.
        realtime.disconnect();
        await other.api.tasks.update(created.id, { title: 'Renamed while away' });
        await other.api.categories.create({ name: 'New', color: '#30d158' });

        // Back online: queue an own change, push, pull — the copy is complete.
        replica.enqueue({ method: 'POST', path: '/tasks', body: { title: 'Made offline' } });
        await replica.flush();
        await replica.pull();
        expect(
          replica
            .all('task')
            .map((item) => item.title)
            .sort(),
        ).toEqual(['Made offline', 'Renamed while away']);
        expect(replica.all('category')).toMatchObject([{ name: 'New' }]);
        const status = await api.sync.status();
        expect(status.device).toMatchObject({ behind: 0, canCatchUp: true });
      } finally {
        realtime.disconnect();
      }
    }
  });

  it('learns about updates and configuration before anyone signs in', async () => {
    const { api } = nativeClient();
    const check = await api.platform.checkForUpdate({
      appId: 'personalitify-desktop',
      platform: 'windows',
      version: '1.0.0',
      installationId: randomUUID(),
    });
    expect(check).toMatchObject({ supported: true, updateAvailable: false, latest: null });
    const config = await api.platform.config({ appId: 'personalitify-desktop' });
    expect(config.values).toEqual({ announcement: null, registrationOpen: true });
    expect(await api.health.get()).toMatchObject({ status: 'ok' });
    expect(await api.health.ready()).toMatchObject({ status: 'ready' });
  });
});
