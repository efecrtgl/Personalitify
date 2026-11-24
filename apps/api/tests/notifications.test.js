import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobLock, defineJob, runJob } from '../src/core/jobs.js';
import '../src/modules/notifications/notifications.jobs.js';
import {
  isQuietTime,
  purgeOldNotifications,
  registerNotificationChannel,
} from '../src/modules/notifications/notifications.service.js';
import { runReminders } from '../src/modules/notifications/reminders.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

// Tuesday 24 November 2026, 08:55 in Istanbul (UTC+3): five minutes before the daily time.
const START = Date.parse('2026-11-24T05:55:00.000Z');
const TODAY = '2026-11-24';
const at = (clock) => new Date(`${TODAY}T${clock}:00.000+03:00`);

function setClock(date = new Date(START)) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(date);
}

describe('quiet hours', () => {
  it('covers a span within a day or across midnight', () => {
    const night = { enabled: true, start: '22:00', end: '07:00' };
    expect(['22:00', '23:59', '00:00', '06:59'].map((time) => isQuietTime(night, time))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(['07:00', '12:00', '21:59'].map((time) => isQuietTime(night, time))).toEqual([
      false,
      false,
      false,
    ]);
    const lunch = { enabled: true, start: '12:00', end: '13:00' };
    expect(['11:59', '12:00', '12:59', '13:00'].map((time) => isQuietTime(lunch, time))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(isQuietTime({ ...night, enabled: false }, '23:00')).toBe(false);
    expect(isQuietTime({ enabled: true, start: '08:00', end: '08:00' }, '08:00')).toBe(false);
    expect(isQuietTime(undefined, '23:00')).toBe(false);
  });
});

describe('background jobs', () => {
  useTestDatabase();

  it('runs a job in one process at a time and remembers its runs', async () => {
    let running = 0;
    let most = 0;
    const seen = [];
    defineJob({
      name: 'test-exclusive',
      intervalMs: 1000,
      run: async (context) => {
        running += 1;
        most = Math.max(most, running);
        seen.push(context.previousRunAt);
        await new Promise((resolve) => setTimeout(resolve, 30));
        running -= 1;
        return 'done';
      },
    });

    const first = new Date('2026-11-24T06:00:00.000Z');
    const outcomes = await Promise.all([
      runJob('test-exclusive', { now: first }),
      runJob('test-exclusive', { now: first }),
      runJob('test-exclusive', { now: first }),
    ]);
    expect(outcomes.filter((outcome) => outcome.ran)).toEqual([{ ran: true, result: 'done' }]);
    expect(most).toBe(1);

    // The next run is told when the previous one started.
    const second = new Date('2026-11-24T06:01:00.000Z');
    expect(await runJob('test-exclusive', { now: second })).toEqual({ ran: true, result: 'done' });
    expect(seen).toEqual([null, first]);
    const lock = await JobLock.findById('test-exclusive').lean();
    expect(lock).toMatchObject({ lockedUntil: null, lastStartedAt: second, lastError: null });
    expect(lock.lastFinishedAt).toBeInstanceOf(Date);
  });

  it('records a failure, frees the lock, and takes over a lock that expired', async () => {
    let fail = true;
    defineJob({
      name: 'test-failing',
      intervalMs: 1000,
      lockMs: 60_000,
      run: async () => {
        if (fail) throw new Error('boom');
        return 1;
      },
    });
    const now = new Date('2026-11-24T06:00:00.000Z');
    const failed = await runJob('test-failing', { now });
    expect(failed.ran).toBe(true);
    expect(failed.error.message).toBe('boom');
    expect((await JobLock.findById('test-failing').lean()).lastError).toBe('boom');

    fail = false;
    // A process that died mid-run leaves its lock behind …
    await JobLock.updateOne(
      { _id: 'test-failing' },
      { $set: { owner: 'dead-process', lockedUntil: new Date(now.getTime() + 60_000) } },
    );
    expect(await runJob('test-failing', { now: new Date(now.getTime() + 59_000) })).toEqual({
      ran: false,
    });
    // … which another process may take once it has expired.
    expect(await runJob('test-failing', { now: new Date(now.getTime() + 61_000) })).toEqual({
      ran: true,
      result: 1,
    });
    await expect(runJob('no-such-job')).rejects.toThrow('Unknown job');
  });
});

describe('notifications', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const post = async (user, path, body) => (await user.post(path, body).expect(201)).body.data;
  const listOf = async (user, query = '') =>
    (await user.get(`/notifications${query}`).expect(200)).body;
  const kindsOf = async (user) => (await listOf(user)).data.map((item) => item.kind);
  const setPreferences = async (user, notifications) => {
    const settings = (await user.get('/settings').expect(200)).body.data;
    await user.patch('/settings', { notifications, baseVersion: settings.version }).expect(200);
  };
  /**
   * A user whose achievement notifications are off, so that a test about reminders sees
   * reminders only.
   */
  async function reminderUser(overrides) {
    const user = await registerUser(overrides);
    await setPreferences(user, { achievements: false });
    return user;
  }
  const totalOf = async (user) => (await listOf(user)).meta.total;
  /** Runs the reminder job for the minute that ends at `clock` (local time). */
  const remindAt = (clock, minutes = 1) =>
    runReminders({
      now: at(clock),
      previousRunAt: new Date(at(clock).getTime() - minutes * 60_000),
    });

  it('reminds of a habit at its time, once, and only while it is open', async () => {
    setClock();
    const user = await reminderUser();
    const reminders = [{ time: '09:00', enabled: true }];
    const read = await post(user, '/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: TODAY,
      reminders: [
        ...reminders,
        { time: '21:00', enabled: true },
        { time: '09:01', enabled: false },
      ],
    });
    const done = await post(user, '/habits', {
      name: 'Done already',
      color: '#30d158',
      startDate: TODAY,
      reminders,
    });
    await user.put(`/habits/${done.id}/entries/${TODAY}`, { value: 1 }).expect(200);
    const skipped = await post(user, '/habits', {
      name: 'Skipped today',
      color: '#ff9f0a',
      startDate: TODAY,
      reminders,
    });
    await user.put(`/habits/${skipped.id}/entries/${TODAY}`, { status: 'skipped' }).expect(200);
    await post(user, '/habits', {
      name: 'Not due on Tuesdays',
      color: '#bf5af2',
      startDate: TODAY,
      schedule: { recurrence: { frequency: 'weekly', weekdays: [1] } },
      reminders,
    });
    // Twice a week, nothing done yet this week: still open.
    const gym = await post(user, '/habits', {
      name: 'Gym',
      color: '#ff375f',
      startDate: TODAY,
      schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 2 },
      reminders,
    });

    await remindAt('08:59');
    expect(await totalOf(user)).toBe(0);
    await remindAt('09:00');
    expect(await totalOf(user)).toBe(2);
    // The same minute again, and a window that overlaps it, remind nobody twice.
    await remindAt('09:00');
    await remindAt('09:02', 5);

    const { data, meta } = await listOf(user);
    expect(meta).toMatchObject({ total: 2, unread: 2 });
    expect(data).toHaveLength(2);
    expect(data.find((item) => item.entityId === read.id)).toMatchObject({
      kind: 'habit_reminder',
      params: { name: 'Read', time: '09:00' },
      entityType: 'habit',
      silent: false,
      read: false,
      readAt: null,
    });
    expect(data.find((item) => item.entityId === gym.id).params.name).toBe('Gym');
  });

  it('reminds of tasks at their time and sums up the day once', async () => {
    setClock();
    const user = await reminderUser();
    const timed = await post(user, '/tasks', { title: 'Call', dueDate: TODAY, dueTime: '09:02' });
    await post(user, '/tasks', { title: 'Later', dueDate: TODAY, dueTime: '18:00' });
    await post(user, '/tasks', { title: 'Any time today', dueDate: TODAY });
    await post(user, '/tasks', { title: 'From last week', dueDate: '2026-11-17' });
    const finished = await post(user, '/tasks', {
      title: 'Finished',
      dueDate: TODAY,
      dueTime: '09:02',
    });
    await user.post(`/tasks/${finished.id}/complete`).expect(200);

    await remindAt('09:00');
    expect((await listOf(user)).data).toMatchObject([
      { kind: 'tasks_today', params: { due: 3, overdue: 1, date: TODAY }, entityId: null },
    ]);
    await remindAt('09:01');
    await remindAt('09:02');
    const { data } = await listOf(user);
    expect(data).toHaveLength(2);
    expect(data.find((item) => item.kind === 'task_due')).toMatchObject({
      kind: 'task_due',
      params: { title: 'Call', time: '09:02' },
      entityType: 'task',
      entityId: timed.id,
    });
  });

  it('announces goal deadlines three days ahead and on the day', async () => {
    setClock();
    const user = await reminderUser();
    const goal = (title, targetDate, extra = {}) =>
      post(user, '/goals', {
        title,
        color: '#30d158',
        startDate: '2026-11-01',
        targetDate,
        ...extra,
      });
    await goal('Soon', '2026-11-27');
    await goal('Today', TODAY);
    await goal('Far away', '2026-12-20');
    await goal('Tomorrow', '2026-11-25');
    const paused = await goal('Paused', TODAY);
    await user.patch(`/goals/${paused.id}`, { status: 'paused' }).expect(200);

    await remindAt('09:00');
    const { data } = await listOf(user);
    expect(data.map((item) => item.params).sort((a, b) => a.days - b.days)).toEqual([
      { title: 'Today', days: 0, date: TODAY },
      { title: 'Soon', days: 3, date: '2026-11-27' },
    ]);
    expect(data.every((item) => item.kind === 'goal_deadline')).toBe(true);
  });

  it('reminds of events ahead of their start, including repeating ones', async () => {
    setClock();
    const user = await reminderUser();
    const meeting = (
      await post(user, '/calendar/events', {
        title: 'Review',
        startDate: TODAY,
        startTime: '09:30',
        endTime: '10:00',
        reminderMinutes: [30, 10],
      })
    ).event;
    // Every day at 10:00, started last week: today's occurrence reminds an hour ahead.
    await post(user, '/calendar/events', {
      title: 'Standup',
      startDate: '2026-11-17',
      startTime: '10:00',
      endTime: '10:15',
      recurrence: { frequency: 'daily' },
      reminderMinutes: [60],
    });
    await post(user, '/calendar/events', {
      title: 'No reminder',
      startDate: TODAY,
      startTime: '09:30',
      endTime: '10:00',
    });

    await remindAt('09:00');
    let { data } = await listOf(user);
    expect(data.map((item) => [item.params.title, item.params.minutes]).sort()).toEqual([
      ['Review', 30],
      ['Standup', 60],
    ]);
    expect(data.find((item) => item.params.title === 'Review')).toMatchObject({
      kind: 'event_reminder',
      params: { date: TODAY, time: '09:30', allDay: false },
      entityType: 'calendarEvent',
      entityId: meeting.id,
    });

    await remindAt('09:20');
    ({ data } = await listOf(user));
    expect(data).toHaveLength(3);
    expect(data.map((item) => item.params.minutes).sort((a, b) => a - b)).toEqual([10, 30, 60]);
  });

  it('follows the user’s time zone and catches up only a little after downtime', async () => {
    setClock();
    const user = await reminderUser({ timeZone: 'America/New_York' });
    await post(user, '/habits', {
      name: 'Stretch',
      color: '#0a84ff',
      startDate: '2026-11-23',
      reminders: [{ time: '09:00', enabled: true }],
    });

    // 09:00 in Istanbul is 01:00 in New York: nothing is due there.
    await remindAt('09:00');
    expect(await totalOf(user)).toBe(0);
    // 09:00 in New York is 14:00 UTC.
    const nineInNewYork = new Date('2026-11-24T14:00:00.000Z');

    // The server was down for two hours: a reminder from an hour ago is not sent late …
    await runReminders({
      now: new Date(nineInNewYork.getTime() + 60 * 60_000),
      previousRunAt: new Date(nineInNewYork.getTime() - 60 * 60_000),
    });
    expect(await totalOf(user)).toBe(0);
    // … but one from ten minutes ago still is.
    await runReminders({
      now: new Date(nineInNewYork.getTime() + 10 * 60_000),
      previousRunAt: new Date(nineInNewYork.getTime() - 60 * 60_000),
    });
    expect(await totalOf(user)).toBe(1);
    expect((await listOf(user)).data[0].params).toEqual({ name: 'Stretch', time: '09:00' });
  });

  it('respects the notification settings and stays silent in quiet hours', async () => {
    setClock();
    const user = await reminderUser();
    const delivered = [];
    const unregister = registerNotificationChannel('test', ({ notification }) => {
      delivered.push(notification.kind);
    });
    try {
      await post(user, '/habits', {
        name: 'Read',
        color: '#0a84ff',
        startDate: TODAY,
        reminders: [
          { time: '09:00', enabled: true },
          { time: '09:01', enabled: true },
          { time: '09:02', enabled: true },
        ],
      });
      await post(user, '/tasks', { title: 'Call', dueDate: TODAY });

      // Task reminders off: only the habit reminds.
      await setPreferences(user, { taskReminders: false });
      await remindAt('09:00');
      expect(await kindsOf(user)).toEqual(['habit_reminder']);
      expect(delivered).toEqual(['habit_reminder']);

      // Quiet hours around now (the clock stands at 08:55): listed, but nobody is alerted.
      await setPreferences(user, { quietHours: { enabled: true, start: '08:00', end: '10:00' } });
      await remindAt('09:01');
      const quiet = (await listOf(user)).data.find((item) => item.params.time === '09:01');
      expect(quiet).toMatchObject({ kind: 'habit_reminder', silent: true });
      expect(delivered).toEqual(['habit_reminder']);

      // Everything off: nothing is made at all.
      await setPreferences(user, { inApp: false, quietHours: { enabled: false } });
      await remindAt('09:02');
      expect(await totalOf(user)).toBe(2);
    } finally {
      unregister();
    }
  });

  it('tells of unlocked achievements and of timers that ran out', async () => {
    setClock();
    const user = await registerUser();
    const task = await post(user, '/tasks', { title: 'First' });
    await user.post(`/tasks/${task.id}/complete`).expect(200);

    let { data } = await listOf(user);
    expect(data).toMatchObject([
      { kind: 'achievement_unlocked', params: { key: 'task_first' }, entityType: 'achievement' },
    ]);

    // A session finished by hand before its time is not news …
    const early = await post(user, '/focus/sessions', { plannedMinutes: 5 });
    setClock(new Date(START + 60_000));
    await user.post(`/focus/sessions/${early.id}/complete`).expect(200);
    expect(await kindsOf(user)).not.toContain('focus_completed');

    // … one that ran out while nobody was looking is, and the job is what ends it.
    const session = await post(user, '/focus/sessions', { plannedMinutes: 1 });
    setClock(new Date(START + 60_000 + 30_000));
    await runJob('focus-timers', { now: new Date() });
    expect((await user.get('/focus').expect(200)).body.data.session).not.toBeNull();
    setClock(new Date(START + 60_000 + 61_000));
    expect(await runJob('focus-timers', { now: new Date() })).toMatchObject({ ran: true });

    ({ data } = await listOf(user));
    expect(data.find((item) => item.kind === 'focus_completed')).toMatchObject({
      kind: 'focus_completed',
      params: { kind: 'focus', minutes: 1 },
      entityType: 'focusSession',
      entityId: session.id,
    });
    expect((await user.get('/focus').expect(200)).body.data.session).toBeNull();

    // With achievement notifications switched off, the next unlock is silent.
    const unlocks = async () =>
      (await kindsOf(user)).filter((kind) => kind === 'achievement_unlocked').length;
    const before = await unlocks();
    await setPreferences(user, { achievements: false });
    await post(user, '/journal', { title: 'Hello' });
    expect(await unlocks()).toBe(before);
    const progress = (await user.get('/achievements').expect(200)).body.data;
    expect(progress.achievements.find((item) => item.key === 'journal_first').unlocked).toBe(true);
  });

  it('lists, marks and deletes notifications for their owner only', async () => {
    setClock();
    const user = await reminderUser();
    const other = await registerUser();
    await post(user, '/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: TODAY,
      reminders: ['09:00', '09:01', '09:02'].map((time) => ({ time, enabled: true })),
    });
    for (const clock of ['09:00', '09:01', '09:02']) {
      setClock(new Date(START + Number(clock.slice(3)) * 1000));
      await remindAt(clock);
    }

    const { data, meta } = await listOf(user);
    expect(data.map((item) => item.params.time)).toEqual(['09:02', '09:01', '09:00']);
    expect(meta).toMatchObject({ total: 3, unread: 3, page: 1 });
    expect((await user.get('/notifications/unread-count').expect(200)).body.data).toEqual({
      unread: 3,
    });
    expect((await listOf(user, '?limit=2&page=2')).data).toHaveLength(1);

    const read = (await user.post(`/notifications/${data[0].id}/read`).expect(200)).body.data;
    expect(read).toMatchObject({ read: true, version: 2 });
    expect(read.readAt).not.toBeNull();
    // Marking it again changes nothing.
    expect(
      (await user.post(`/notifications/${data[0].id}/read`).expect(200)).body.data.version,
    ).toBe(2);
    expect((await listOf(user, '?unread=true')).data.map((item) => item.id)).toEqual([
      data[1].id,
      data[2].id,
    ]);
    const unread = (await user.post(`/notifications/${data[0].id}/unread`).expect(200)).body.data;
    expect(unread).toMatchObject({ read: false, readAt: null });

    expect((await user.post('/notifications/read-all').expect(200)).body.data).toEqual({
      updated: 3,
    });
    expect((await listOf(user)).meta.unread).toBe(0);
    expect((await user.post('/notifications/read-all').expect(200)).body.data).toEqual({
      updated: 0,
    });

    await user.delete(`/notifications/${data[2].id}`).expect(204);
    expect((await listOf(user)).meta.total).toBe(2);
    // A deleted notification is not made again by a later run.
    await remindAt('09:00');
    expect(await totalOf(user)).toBe(2);

    // Another account sees none of it.
    expect((await listOf(other)).data).toEqual([]);
    await other.post(`/notifications/${data[0].id}/read`).expect(404);
    await other.delete(`/notifications/${data[0].id}`).expect(404);
    await user.post('/notifications', { kind: 'habit_reminder' }).expect(404);

    const exported = (await user.get('/account/export').expect(200)).body.data.data;
    expect(exported.notification).toHaveLength(2);
  });

  it('runs through the job runner and forgets old notifications', async () => {
    setClock();
    const user = await reminderUser();
    await post(user, '/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: TODAY,
      reminders: [{ time: '09:00', enabled: true }],
    });

    // The first run of a fresh installation looks back one minute.
    const first = await runJob('reminders', { now: at('09:00') });
    expect(first.ran).toBe(true);
    expect(first.result.users).toBeGreaterThanOrEqual(1);
    expect(first.result.sent).toBeGreaterThanOrEqual(1);
    expect(await runJob('reminders', { now: at('09:01') })).toMatchObject({ ran: true });
    expect(await kindsOf(user)).toEqual(['habit_reminder']);

    const day = 86_400_000;
    expect(await purgeOldNotifications(new Date(START + 59 * day))).toBe(0);
    const cleanup = await runJob('notifications-cleanup', { now: new Date(START + 61 * day) });
    expect(cleanup.result).toBeGreaterThanOrEqual(1);
    expect((await listOf(user)).data).toEqual([]);
  });
});
