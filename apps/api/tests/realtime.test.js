import { io as connectRaw } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRealtime } from '../../../packages/api-client/src/index.js';
import {
  attachRealtime,
  closeRealtime,
  connectionCount,
} from '../src/modules/realtime/realtime.server.js';
import { getApp, loginUser, registerUser, serverUrl } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

/** Polls with real timers until `check` passes. */
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

describe('realtime', () => {
  useTestDatabase();
  let url;
  const open = [];

  beforeAll(async () => {
    attachRealtime(getApp());
    url = serverUrl();
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const connection of open.splice(0)) connection.disconnect();
  });
  afterAll(() => closeRealtime());

  /** A client as an application would use it, recording what it is told. */
  function connect(user, options = {}) {
    const events = [];
    const statuses = [];
    let resets = 0;
    const client = createRealtime({
      url,
      getToken: async () => options.token ?? user.tokens.accessToken,
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      onReset: () => {
        resets += 1;
      },
      cursor: options.cursor ?? null,
    });
    open.push(client);
    client.connect();
    return { client, events, statuses, resets: () => resets };
  }
  const connected = (connection) =>
    eventually(() => expect(connection.statuses).toContain('connected'));

  /** A bare Socket.IO connection, for looking at the protocol itself. */
  function rawSocket(token) {
    const socket = connectRaw(url, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    open.push(socket);
    return socket;
  }
  const once = (socket, name) => new Promise((resolve) => socket.once(name, resolve));

  it('refuses connections without a valid access token', async () => {
    for (const token of [undefined, 'not-a-token']) {
      const error = await once(rawSocket(token), 'connect_error');
      expect(error.data).toEqual({ code: 'UNAUTHENTICATED' });
    }
    // The client reports it and does not keep trying.
    const user = await registerUser();
    const refused = connect(user, { token: 'not-a-token' });
    await eventually(() => expect(refused.statuses).toEqual(['connecting', 'unauthorized']));
    expect(refused.client.isConnected()).toBe(false);
  });

  it('pushes every change of the account, in order, to that account only', async () => {
    const user = await registerUser();
    const other = await registerUser();
    const mine = connect(user);
    const theirs = connect(other);
    await Promise.all([connected(mine), connected(theirs)]);
    const startedAt = mine.client.getCursor();

    const task = (await user.post('/tasks', { title: 'Write' }).expect(201)).body.data;
    await user.patch(`/tasks/${task.id}`, { title: 'Write more' }).expect(200);
    await user.delete(`/tasks/${task.id}`).expect(204);

    await eventually(() =>
      expect(mine.events.map((event) => event.event)).toEqual([
        'task.created',
        'task.updated',
        'task.deleted',
      ]),
    );
    expect(mine.events.map((event) => event.seq)).toEqual([
      startedAt + 1,
      startedAt + 2,
      startedAt + 3,
    ]);
    expect(mine.events[1]).toMatchObject({
      userId: user.userId,
      entityType: 'task',
      entityId: task.id,
      entityVersion: 2,
      changedFields: ['title'],
      originDeviceId: user.tokens.deviceId,
      data: { id: task.id, title: 'Write more' },
    });
    expect(mine.client.getCursor()).toBe(startedAt + 3);

    // The same events, in the same order, are what the REST log returns.
    const log = (await user.get(`/events?after=${startedAt}`).expect(200)).body;
    expect(log.data).toEqual(mine.events);
    expect(log.meta).toEqual({ headSeq: startedAt + 3, hasMore: false });

    // The other account heard nothing of it.
    await other.post('/tasks', { title: 'Theirs' }).expect(201);
    await eventually(() => expect(theirs.events).toHaveLength(1));
    expect(theirs.events[0].data.title).toBe('Theirs');
    expect(mine.events).toHaveLength(3);
  });

  it('reaches every device of the user and says where a change came from', async () => {
    const user = await registerUser();
    const phone = await loginUser(user.credentials);
    const desktopFeed = connect(user);
    const phoneFeed = connect(phone);
    await Promise.all([connected(desktopFeed), connected(phoneFeed)]);

    await phone.post('/tasks', { title: 'From the phone' }).expect(201);
    await eventually(() => {
      expect(desktopFeed.events).toHaveLength(1);
      expect(phoneFeed.events).toHaveLength(1);
    });
    expect(desktopFeed.events[0]).toEqual(phoneFeed.events[0]);
    expect(desktopFeed.events[0].originDeviceId).toBe(phone.tokens.deviceId);
    expect(phone.tokens.deviceId).not.toBe(user.tokens.deviceId);
  });

  it('delivers what a client missed while it was away', async () => {
    const user = await registerUser();
    const first = connect(user);
    await connected(first);
    await user.post('/tasks', { title: 'Seen' }).expect(201);
    await eventually(() => expect(first.events).toHaveLength(1));
    const cursor = first.client.getCursor();
    first.client.disconnect();

    for (const title of ['Missed one', 'Missed two', 'Missed three']) {
      await user.post('/tasks', { title }).expect(201);
    }

    // The client comes back with the position it had reached.
    const back = connect(user, { cursor });
    await eventually(() => expect(back.events).toHaveLength(3));
    expect(back.events.map((event) => event.data.title)).toEqual([
      'Missed one',
      'Missed two',
      'Missed three',
    ]);
    expect(back.events.map((event) => event.seq)).toEqual([cursor + 1, cursor + 2, cursor + 3]);

    // And keeps receiving, without repeating anything.
    await user.post('/tasks', { title: 'Live again' }).expect(201);
    await eventually(() => expect(back.events).toHaveLength(4));
    expect(back.events[3].seq).toBe(cursor + 4);
    expect(back.resets()).toBe(0);
  });

  it('loses nothing and repeats nothing under a burst of changes', async () => {
    const user = await registerUser();
    const feed = connect(user);
    await connected(feed);
    const startedAt = feed.client.getCursor();

    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        user.post('/tasks', { title: `Task ${index}` }).expect(201),
      ),
    );
    await eventually(() => expect(feed.events).toHaveLength(40));
    expect(feed.events.map((event) => event.seq)).toEqual(
      Array.from({ length: 40 }, (_, index) => startedAt + index + 1),
    );
    expect(new Set(feed.events.map((event) => event.entityId)).size).toBe(40);
  });

  it('answers replay requests and reads the log page by page', async () => {
    const user = await registerUser();
    for (const title of ['One', 'Two', 'Three']) {
      await user.post('/tasks', { title }).expect(201);
    }
    const socket = rawSocket(user.tokens.accessToken);
    const ready = await once(socket, 'ready');
    expect(ready).toMatchObject({ userId: user.userId, deviceId: user.tokens.deviceId });
    expect(new Date(ready.serverTime).getTime()).not.toBeNaN();
    const { headSeq } = ready;
    expect(headSeq).toBeGreaterThanOrEqual(3);

    const ask = (request) =>
      new Promise((resolve) => {
        socket.emit('replay', request, resolve);
      });
    const page = await ask({ after: headSeq - 3, limit: 2 });
    expect(page).toMatchObject({ ok: true, headSeq, hasMore: true });
    expect(page.events.map((event) => event.seq)).toEqual([headSeq - 2, headSeq - 1]);
    const rest = await ask({ after: headSeq - 1 });
    expect(rest).toMatchObject({ ok: true, hasMore: false });
    expect(rest.events.map((event) => event.data.title)).toEqual(['Three']);
    expect((await ask({ after: headSeq })).events).toEqual([]);
    // Nonsense is answered like a request from the beginning, not with an error.
    expect((await ask({ after: 'x', limit: -5 })).ok).toBe(true);
    expect((await ask(null)).ok).toBe(true);

    // The REST log pages the same way.
    const first = (await user.get(`/events?after=${headSeq - 3}&limit=2`).expect(200)).body;
    expect(first.data.map((event) => event.seq)).toEqual([headSeq - 2, headSeq - 1]);
    expect(first.meta).toEqual({ headSeq, hasMore: true });
    const all = (await user.get('/events').expect(200)).body;
    expect(all.data[0].seq).toBe(1);
    expect(all.data.at(-1).seq).toBe(headSeq);
    await user.get('/events?after=-1').expect(400);
    await user.get('/events?limit=501').expect(400);
  });

  it('closes the connections of a session when it is signed out', async () => {
    const user = await registerUser();
    const phone = await loginUser(user.credentials);
    const desktopFeed = connect(user);
    const phoneFeed = connect(phone);
    await Promise.all([connected(desktopFeed), connected(phoneFeed)]);

    await phone.post('/auth/logout').expect(204);
    await eventually(() => expect(phoneFeed.statuses.at(-1)).toBe('unauthorized'));
    expect(phoneFeed.client.isConnected()).toBe(false);
    // The other session is untouched and still hears changes.
    expect(desktopFeed.client.isConnected()).toBe(true);
    await user.post('/tasks', { title: 'Still here' }).expect(201);
    await eventually(() => expect(desktopFeed.events).toHaveLength(1));
    expect(phoneFeed.events).toEqual([]);

    // The signed-out session cannot come back with its old token.
    const error = await once(rawSocket(phone.tokens.accessToken), 'connect_error');
    expect(error.data).toEqual({ code: 'SESSION_REVOKED' });

    // Signing out everywhere closes what is left.
    await user.post('/auth/logout-all').expect(200);
    await eventually(() => expect(desktopFeed.statuses.at(-1)).toBe('unauthorized'));
    await eventually(() => expect(connectionCount()).toBe(0));
  });

  it('ends a connection with its access token and lets the client return with a new one', async () => {
    const user = await registerUser();
    // A token's expiry is written in whole seconds.
    const expiresAt = Math.floor(Date.parse(user.tokens.accessTokenExpiresAt) / 1000) * 1000;

    // The token has a second and a half left when the connection is opened.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(expiresAt - 1500));
    const socket = rawSocket(user.tokens.accessToken);
    await once(socket, 'ready');
    const expired = once(socket, 'auth:expired');
    const closed = once(socket, 'disconnect');
    await expired;
    expect(await closed).toBe('io server disconnect');

    // With the expired token the door stays shut, and the reason is named.
    vi.setSystemTime(new Date(expiresAt + 1000));
    const error = await once(rawSocket(user.tokens.accessToken), 'connect_error');
    expect(error.data).toEqual({ code: 'TOKEN_EXPIRED' });
  });
});
