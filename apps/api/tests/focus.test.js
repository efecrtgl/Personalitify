import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const START = Date.parse('2026-11-24T09:00:00.000Z'); // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';
const at = (seconds) => new Date(START + seconds * 1000);
const iso = (seconds) => at(seconds).toISOString();

/** Freezes the clock at `seconds` after the start; sessions stay inside the token lifetime. */
function setClock(seconds = 0) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(seconds));
}

describe('focus timer', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const start = async (user, body = {}) =>
    (await user.post('/focus/sessions', body).expect(201)).body.data;
  const act = async (user, session, action, status = 200) =>
    (await user.post(`/focus/sessions/${session.id}/${action}`).expect(status)).body;
  const stateOf = async (user) => (await user.get('/focus').expect(200)).body.data;

  it('starts empty, with the default lengths and the server clock', async () => {
    setClock();
    const user = await registerUser();
    expect(await stateOf(user)).toEqual({
      serverTime: iso(0),
      today: TODAY,
      session: null,
      settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      suggestedKind: 'focus',
      todayFocus: { sessions: 0, seconds: 0 },
      week: [
        '2026-11-18',
        '2026-11-19',
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
        '2026-11-23',
        TODAY,
      ].map((date) => ({ date, sessions: 0, seconds: 0 })),
    });
  });

  it('starts a session with server times and allows only one at a time', async () => {
    setClock();
    const user = await registerUser();
    const session = await start(user);
    expect(session).toMatchObject({
      kind: 'focus',
      status: 'running',
      plannedMinutes: 25,
      startedAt: iso(0),
      endsAt: iso(25 * 60),
      pausedAt: null,
      pausedSeconds: 0,
      endedAt: null,
      elapsedSeconds: 0,
      date: TODAY,
      version: 1,
    });
    expect((await stateOf(user)).session).toEqual(session);

    const refused = (await user.post('/focus/sessions', { kind: 'short_break' }).expect(409)).body;
    expect(refused.error).toMatchObject({
      code: 'INVALID_STATE',
      details: { reason: 'session_active', sessionId: session.id },
    });

    // A client cannot set the times, and links must be the user's own records.
    await user.post('/focus/sessions', { startedAt: iso(-600) }).expect(400);
    await act(user, session, 'cancel');
    await user
      .post('/focus/sessions', { taskId: '7b0c1f0e-6f0e-4d8b-9a55-3f0a6c1d2e3f' })
      .expect(400);
  });

  it('leaves paused time out of the session', async () => {
    setClock();
    const user = await registerUser();
    const session = await start(user, { plannedMinutes: 5 });

    setClock(60);
    await act(user, session, 'resume', 409);
    const paused = (await act(user, session, 'pause')).data;
    expect(paused).toMatchObject({
      status: 'paused',
      pausedAt: iso(60),
      elapsedSeconds: 60,
      endsAt: null,
    });
    await act(user, session, 'pause', 409);

    // Two minutes pass while paused: the end moves by exactly that much.
    setClock(180);
    const resumed = (await act(user, session, 'resume')).data;
    expect(resumed).toMatchObject({
      status: 'running',
      pausedAt: null,
      pausedSeconds: 120,
      endsAt: iso(5 * 60 + 120),
    });

    setClock(210);
    const finished = (await act(user, session, 'complete')).data;
    expect(finished).toMatchObject({
      status: 'completed',
      elapsedSeconds: 90,
      endedAt: iso(210),
      endsAt: null,
    });
    expect((await stateOf(user)).todayFocus).toEqual({ sessions: 1, seconds: 90 });

    // Finishing while paused counts the time up to the pause.
    setClock(220);
    const second = await start(user, { plannedMinutes: 5 });
    setClock(250);
    await act(user, second, 'pause');
    setClock(400);
    expect((await act(user, second, 'complete')).data).toMatchObject({
      status: 'completed',
      elapsedSeconds: 30,
      pausedSeconds: 150,
      endedAt: iso(400),
    });
  });

  it('completes a session on the server when its time is up', async () => {
    setClock();
    const user = await registerUser();
    const session = await start(user, { plannedMinutes: 2 });

    // Nobody had the timer open when it ran out a minute ago.
    setClock(180);
    const state = await stateOf(user);
    expect(state.session).toBeNull();
    expect(state.todayFocus).toEqual({ sessions: 1, seconds: 120 });
    expect(state.suggestedKind).toBe('short_break');

    const stored = (await user.get(`/focus/sessions/${session.id}`).expect(200)).body.data;
    expect(stored).toMatchObject({ status: 'completed', endedAt: iso(120), elapsedSeconds: 120 });

    // A client that reports the end late gets the same session back; nothing else applies.
    expect((await act(user, session, 'complete')).data).toEqual(stored);
    await act(user, session, 'pause', 409);
    await act(user, session, 'cancel', 409);

    // The finished timer no longer blocks a new one.
    const next = await start(user, { kind: 'short_break' });
    expect(next).toMatchObject({ kind: 'short_break', plannedMinutes: 5, startedAt: iso(180) });
  });

  it('suggests breaks after focus, counts only completed focus time and lists the history', async () => {
    setClock();
    const user = await registerUser();
    const settings = (await user.get('/settings').expect(200)).body.data;
    const updated = (
      await user
        .patch('/settings', {
          focus: { focusMinutes: 2, longBreakEvery: 2 },
          baseVersion: settings.version,
        })
        .expect(200)
    ).body.data;
    expect(updated.focus).toEqual({
      focusMinutes: 2,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 2,
    });
    await user.patch('/settings', { focus: { focusMinutes: 0 } }).expect(400);

    const first = await start(user);
    expect(first.plannedMinutes).toBe(2);
    setClock(120);
    expect((await stateOf(user)).suggestedKind).toBe('short_break');

    const pause = await start(user, { kind: 'short_break', plannedMinutes: 1 });
    setClock(150);
    await act(user, pause, 'complete');
    expect((await stateOf(user)).suggestedKind).toBe('focus');

    // An abandoned session is kept but counts towards nothing.
    const abandoned = await start(user);
    setClock(200);
    expect((await act(user, abandoned, 'cancel')).data).toMatchObject({
      status: 'cancelled',
      elapsedSeconds: 50,
      endedAt: iso(200),
    });
    expect((await act(user, abandoned, 'cancel')).data.status).toBe('cancelled');

    const second = await start(user);
    setClock(330);
    const state = await stateOf(user);
    expect(state.todayFocus).toEqual({ sessions: 2, seconds: 240 });
    // Every second focus session of the day earns the long break.
    expect(state.suggestedKind).toBe('long_break');
    expect(state.week.at(-1)).toEqual({ date: TODAY, sessions: 2, seconds: 240 });

    const history = (await user.get('/focus/sessions').expect(200)).body;
    expect(history.data.map((item) => [item.id, item.status])).toEqual([
      [second.id, 'completed'],
      [abandoned.id, 'cancelled'],
      [pause.id, 'completed'],
      [first.id, 'completed'],
    ]);
    expect(history.meta).toMatchObject({ total: 4, page: 1 });
    const breaks = (await user.get('/focus/sessions?kind=short_break').expect(200)).body.data;
    expect(breaks.map((item) => item.id)).toEqual([pause.id]);

    const stats = (await user.get(`/focus/stats?from=2026-11-23&to=${TODAY}`).expect(200)).body
      .data;
    expect(stats).toEqual({
      from: '2026-11-23',
      to: TODAY,
      days: [
        { date: '2026-11-23', sessions: 0, seconds: 0 },
        { date: TODAY, sessions: 2, seconds: 240 },
      ],
      sessions: 2,
      seconds: 240,
    });
    await user.get(`/focus/stats?from=${TODAY}&to=2026-11-23`).expect(400);
    await user.get('/focus/stats?from=2025-01-01&to=2026-11-24').expect(400);
  });

  it('links a session to a task, keeps notes and stays private', async () => {
    setClock();
    const user = await registerUser();
    const other = await registerUser();
    const task = (await user.post('/tasks', { title: 'Write report' }).expect(201)).body.data;

    const session = await start(user, { taskId: task.id, note: 'Chapter one' });
    expect(session).toMatchObject({ taskId: task.id, note: 'Chapter one' });

    const patched = (
      await user
        .patch(`/focus/sessions/${session.id}`, { note: 'Chapter two', baseVersion: 1 })
        .expect(200)
    ).body.data;
    expect(patched).toMatchObject({ note: 'Chapter two', taskId: task.id, version: 2 });
    await user.patch(`/focus/sessions/${session.id}`, { plannedMinutes: 90 }).expect(400);

    // Another account neither sees nor controls it, and may run its own timer.
    await other.get(`/focus/sessions/${session.id}`).expect(404);
    await other.post(`/focus/sessions/${session.id}/complete`).expect(404);
    expect((await stateOf(other)).session).toBeNull();
    await start(other);

    // Deleting the task detaches it from the session.
    await user.delete(`/tasks/${task.id}`).expect(204);
    await vi.waitFor(async () => {
      const current = (await user.get(`/focus/sessions/${session.id}`).expect(200)).body.data;
      expect(current.taskId).toBeNull();
    });

    await user.delete(`/focus/sessions/${session.id}`).expect(204);
    await user.get(`/focus/sessions/${session.id}`).expect(404);
    expect((await stateOf(user)).session).toBeNull();
    // A deleted active session does not block the next one.
    await start(user);
  });
});
