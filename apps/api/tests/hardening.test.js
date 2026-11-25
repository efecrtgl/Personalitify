import { io as connectRaw } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { configureRateLimits } from '../src/middleware/rate-limit.js';
import { Achievement, XpGrant } from '../src/modules/achievements/progress.model.js';
import { CalendarEvent } from '../src/modules/calendar/calendar-event.model.js';
import { SyncEvent } from '../src/modules/events/sync-event.model.js';
import { FocusSession } from '../src/modules/focus/focus-session.model.js';
import { Goal } from '../src/modules/goals/goal.model.js';
import { Habit, HabitEntry } from '../src/modules/habits/habit.model.js';
import { JournalEntry } from '../src/modules/journal/journal-entry.model.js';
import { MoodEntry } from '../src/modules/mood/mood-entry.model.js';
import { Notification } from '../src/modules/notifications/notification.model.js';
import {
  MAX_CONNECTIONS_PER_USER,
  attachRealtime,
  closeRealtime,
  connectionCount,
} from '../src/modules/realtime/realtime.server.js';
import { Task } from '../src/modules/tasks/task.model.js';
import { getApp, registerUser, serverUrl } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

async function eventually(check, timeoutMs = 5000) {
  const started = performance.now();
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (performance.now() - started > timeoutMs) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

describe('production configuration', () => {
  const base = {
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://db.internal:27017/personalitify',
    JWT_ACCESS_SECRET: 'x'.repeat(48),
    COOKIE_SECURE: 'true',
    WEB_ORIGINS: 'https://app.example.com',
    PUBLIC_WEB_URL: 'https://app.example.com',
  };

  it('accepts a production setup that is served over https', () => {
    const config = parseEnv({ ...base, TRUST_PROXY_HOPS: '1', SYNC_RETENTION_DAYS: '30' });
    expect(config).toMatchObject({
      isProduction: true,
      trustProxyHops: 1,
      auth: { cookieSecure: true },
      sync: { retentionDays: 30 },
    });
  });

  it('refuses to start in production with development settings', () => {
    expect(() => parseEnv({ ...base, COOKIE_SECURE: 'false' })).toThrowError(
      /Unsafe production configuration[\s\S]*COOKIE_SECURE must be true/,
    );
    expect(() =>
      parseEnv({ ...base, WEB_ORIGINS: 'https://app.example.com,http://localhost:5173' }),
    ).toThrowError(/WEB_ORIGINS must use https \(found http:\/\/localhost:5173\)/);
    expect(() => parseEnv({ ...base, PUBLIC_WEB_URL: 'http://app.example.com' })).toThrowError(
      /PUBLIC_WEB_URL must use https/,
    );
    // Every problem is listed at once.
    expect(() =>
      parseEnv({ ...base, COOKIE_SECURE: '', PUBLIC_WEB_URL: 'http://app.example.com' }),
    ).toThrowError(/COOKIE_SECURE[\s\S]*PUBLIC_WEB_URL/);
    // The same settings are fine for development.
    expect(parseEnv({ ...base, NODE_ENV: 'development', COOKIE_SECURE: 'false' }).env).toBe(
      'development',
    );
    expect(() => parseEnv({ ...base, TRUST_PROXY_HOPS: '-1' })).toThrowError(/TRUST_PROXY_HOPS/);
  });
});

describe('abuse limits', () => {
  useTestDatabase();
  beforeAll(() => {
    attachRealtime(getApp());
  });
  afterEach(() => configureRateLimits({ enabled: false, pushMax: 30 }));
  afterAll(() => closeRealtime());

  it('counts pushes far more strictly than single requests', async () => {
    const user = await registerUser();
    const push = () =>
      user.post('/sync/push', {
        operations: [
          {
            opId: crypto.randomUUID(),
            method: 'POST',
            path: '/tasks',
            body: { title: 'Queued' },
          },
        ],
      });
    configureRateLimits({ enabled: true, pushMax: 2 });
    await push().expect(200);
    await push().expect(200);
    const limited = await push().expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBe('60');
    // Ordinary requests of the same client are not affected.
    await user.get('/tasks').expect(200);
  });

  it('caps the realtime connections of an account and its replay requests', async () => {
    const user = await registerUser();
    const sockets = [];
    const open = () =>
      new Promise((resolve, reject) => {
        const socket = connectRaw(serverUrl(), {
          auth: { token: user.tokens.accessToken },
          transports: ['websocket'],
          reconnection: false,
        });
        sockets.push(socket);
        socket.once('ready', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    try {
      for (let index = 0; index < MAX_CONNECTIONS_PER_USER; index += 1) await open();
      await eventually(() => expect(connectionCount()).toBe(MAX_CONNECTIONS_PER_USER));

      // One more: the oldest connection makes room.
      const newest = await open();
      await eventually(() => expect(sockets[0].connected).toBe(false));
      expect(newest.connected).toBe(true);
      expect(sockets[1].connected).toBe(true);
      await eventually(() => expect(connectionCount()).toBe(MAX_CONNECTIONS_PER_USER));

      // A connection may ask for replays, but not in an endless loop.
      const ask = () =>
        new Promise((resolve) => {
          newest.emit('replay', { after: 0, limit: 1 }, resolve);
        });
      const answers = [];
      for (let index = 0; index < 35; index += 1) answers.push(await ask());
      expect(answers.slice(0, 30).every((answer) => answer.ok)).toBe(true);
      expect(answers.slice(30)).toEqual(
        Array.from({ length: 5 }, () => ({ ok: false, code: 'RATE_LIMITED' })),
      );
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  });
});

describe('indexes', () => {
  useTestDatabase();

  /** The stages of a query plan, innermost last. */
  function stagesOf(plan, stages = []) {
    if (!plan) return stages;
    stages.push(plan.stage);
    for (const child of [plan.inputStage, ...(plan.inputStages ?? [])]) stagesOf(child, stages);
    return stages;
  }
  async function expectIndexed(name, query) {
    const explained = await query.explain('queryPlanner');
    const stages = stagesOf(explained.queryPlanner.winningPlan);
    expect(stages, name).toContain('IXSCAN');
    expect(stages, name).not.toContain('COLLSCAN');
  }

  it('answers the queries of every busy screen from an index', async () => {
    // Enough records that scanning the collection would be the planner's losing choice.
    const user = await registerUser();
    const userId = user.userId;
    const today = '2026-11-24';
    const live = { userId, deletedAt: null };

    await expectIndexed(
      'tasks of a day',
      Task.find({ ...live, status: { $in: ['todo', 'in_progress'] }, dueDate: { $lte: today } }),
    );
    await expectIndexed(
      'tasks finished in a period',
      Task.find({ ...live, completedOn: { $gte: '2026-11-01', $lte: today } }),
    );
    await expectIndexed('tasks of a goal', Task.find({ userId, goalId: 'goal-1' }));
    await expectIndexed('habits', Habit.find({ ...live, archivedAt: null }).sort({ sortOrder: 1 }));
    await expectIndexed(
      'habit entries of a range',
      HabitEntry.find({
        userId,
        habitId: { $in: ['habit-1', 'habit-2'] },
        deletedAt: null,
        date: { $gte: '2026-10-01', $lte: today },
      }),
    );
    await expectIndexed('active goals', Goal.find({ ...live, status: 'active' }));
    await expectIndexed(
      'calendar events of a range',
      CalendarEvent.find({ ...live, recurring: false, startDate: { $lte: today } }),
    );
    await expectIndexed(
      'events after a cursor',
      SyncEvent.find({ userId, seq: { $gt: 100 } }).sort({ seq: 1 }),
    );
    await expectIndexed(
      'latest notifications',
      Notification.find(live).sort({ createdAt: -1 }).limit(20),
    );
    await expectIndexed('unread notifications', Notification.find({ ...live, readAt: null }));
    await expectIndexed(
      'journal list',
      JournalEntry.find(live).sort({ pinned: -1, date: -1, updatedAt: -1 }).limit(20),
    );
    await expectIndexed('journal by tag', JournalEntry.find({ ...live, tags: 'work' }));
    await expectIndexed(
      'mood of a month',
      MoodEntry.find({ ...live, date: { $gte: '2026-11-01', $lte: '2026-11-30' } }),
    );
    await expectIndexed('unlocked achievements', Achievement.find(live));
    await expectIndexed('the active timer', FocusSession.find({ ...live, active: true }));
    await expectIndexed(
      'focus sessions of a period',
      FocusSession.find({ ...live, date: { $gte: '2026-11-18', $lte: today } }),
    );
    await expectIndexed(
      'XP of a period',
      XpGrant.find({ userId, date: { $gte: '2026-11-18', $lte: today } }),
    );
    await expectIndexed(
      'XP of a record',
      XpGrant.find({ userId, entityType: 'task', entityId: 'x' }),
    );
  });
});
