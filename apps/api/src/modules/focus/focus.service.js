import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { assertOwnedReferences, detachOnDelete } from '../../core/entity/references.js';
import { fieldError, invalidState } from '../../core/errors.js';
import { addDays, diffDays } from '../../core/time.js';
import { goalService } from '../goals/goals.service.js';
import { getUserCalendar, habitService } from '../habits/habits.service.js';
import { focusPreferences } from '../settings/settings.model.js';
import { getUserPreferences } from '../settings/settings.service.js';
import { taskService } from '../tasks/tasks.service.js';
import {
  FocusSession,
  elapsedSecondsAt,
  endsAtOf,
  serializeFocusSession,
} from './focus-session.model.js';

export const focusService = createEntityService({
  entityType: ENTITY_TYPES.FOCUS_SESSION,
  model: FocusSession,
  serialize: serializeFocusSession,
});

for (const [field, targetType] of [
  ['taskId', ENTITY_TYPES.TASK],
  ['habitId', ENTITY_TYPES.HABIT],
  ['goalId', ENTITY_TYPES.GOAL],
]) {
  detachOnDelete({ service: focusService, field, targetType });
}

const MAX_RANGE_DAYS = 400;
const PLANNED_BY_KIND = {
  focus: 'focusMinutes',
  short_break: 'shortBreakMinutes',
  long_break: 'longBreakMinutes',
};

async function assertLinks(auth, input) {
  await assertOwnedReferences(auth, taskService, input.taskId, 'taskId');
  await assertOwnedReferences(auth, habitService, input.habitId, 'habitId');
  await assertOwnedReferences(auth, goalService, input.goalId, 'goalId');
}

/** Ends a session at `at` (never later than its planned end) with the given final status. */
function finish(session, status, at) {
  if (session.pausedAt) {
    // Time spent paused does not count, however the session ends.
    session.elapsedSeconds = elapsedSecondsAt(session, at);
    session.pausedSeconds += Math.max(0, Math.floor((at - session.pausedAt) / 1000));
    session.pausedAt = null;
    session.endedAt = at;
  } else {
    const plannedEnd = new Date(
      session.startedAt.getTime() + (session.plannedMinutes * 60 + session.pausedSeconds) * 1000,
    );
    session.elapsedSeconds = elapsedSecondsAt(session, at);
    session.endedAt = at < plannedEnd ? at : plannedEnd;
  }
  session.status = status;
  session.active = false;
}

/**
 * The user's running or paused session, if any. A running session whose planned length has
 * passed is completed here, at its planned end: the timer finishes on the server whether or
 * not a client was open to see it.
 */
async function currentSession(auth) {
  const active = await FocusSession.findOne({ userId: auth.userId, active: true, deletedAt: null });
  if (!active) return null;
  const endsAt = endsAtOf(active);
  if (!endsAt || endsAt > new Date()) return active;

  await focusService.mutate(auth, active._id, (session) => {
    if (session.active && session.status === 'running') finish(session, 'completed', new Date());
  });
  return null;
}

/**
 * Completes every running session whose time is up, for all users. Run by a background job
 * so that a timer ends on time even when no client is looking at it.
 */
export async function completeExpiredSessions(now = new Date()) {
  const running = await FocusSession.find({ active: true, status: 'running', deletedAt: null })
    .select('userId status startedAt plannedMinutes pausedSeconds')
    .lean();
  let completed = 0;
  for (const session of running) {
    if (endsAtOf(session) > now) continue;
    await currentSession({ userId: session.userId });
    completed += 1;
  }
  return completed;
}

/** Changes the active session with `id`; anything else is not in a state to be changed. */
async function transition(auth, id, change, { alreadyDone } = {}) {
  await currentSession(auth);
  const { document } = await focusService.mutate(auth, id, (session) => {
    // A timer that ran out a moment ago was completed by the server; asking for the state
    // it already has is not an error.
    if (!session.active && session.status === alreadyDone) return;
    if (!session.active) throw invalidState({ details: { status: session.status } });
    change(session, new Date());
  });
  return serializeFocusSession(document);
}

export async function startSession(auth, { id, kind = 'focus', plannedMinutes, ...input }) {
  await assertLinks(auth, input);
  const [calendar, preferences, active] = await Promise.all([
    getUserCalendar(auth.userId),
    getUserPreferences(auth.userId),
    currentSession(auth),
  ]);
  const alreadyActive = (sessionId) =>
    invalidState({ details: { reason: 'session_active', sessionId } });
  if (active) throw alreadyActive(String(active._id));

  const attributes = {
    ...input,
    kind,
    plannedMinutes: plannedMinutes ?? focusPreferences(preferences)[PLANNED_BY_KIND[kind]],
    status: 'running',
    active: true,
    startedAt: new Date(),
    date: calendar.today,
  };
  try {
    return serializeFocusSession(await focusService.create(auth, attributes, { id }));
  } catch (error) {
    // Two devices started at the same moment: the unique index let one of them through.
    if (error?.code === 11000) throw alreadyActive(null);
    throw error;
  }
}

export const pauseSession = (auth, id) =>
  transition(auth, id, (session, now) => {
    if (session.status !== 'running') throw invalidState({ details: { status: session.status } });
    session.elapsedSeconds = elapsedSecondsAt(session, now);
    session.pausedAt = now;
    session.status = 'paused';
  });

export const resumeSession = (auth, id) =>
  transition(auth, id, (session, now) => {
    if (session.status !== 'paused') throw invalidState({ details: { status: session.status } });
    session.pausedSeconds += Math.max(0, Math.floor((now - session.pausedAt) / 1000));
    session.pausedAt = null;
    session.status = 'running';
  });

/** Finishes the session now; the time spent so far is what counts. */
export const completeSession = (auth, id) =>
  transition(auth, id, (session, now) => finish(session, 'completed', now), {
    alreadyDone: 'completed',
  });

/** Abandons the session. It stays in the history but counts towards nothing. */
export const cancelSession = (auth, id) =>
  transition(auth, id, (session, now) => finish(session, 'cancelled', now), {
    alreadyDone: 'cancelled',
  });

export async function getSession(auth, id) {
  await currentSession(auth);
  return serializeFocusSession(await focusService.getById(auth, id));
}

export async function updateSession(auth, id, { baseVersion, ...patch }) {
  await assertLinks(auth, patch);
  const { document } = await focusService.mutate(
    auth,
    id,
    (session) => assignPatch(session, patch),
    { baseVersion, intendedFields: Object.keys(patch) },
  );
  return serializeFocusSession(document);
}

export async function deleteSession(auth, id) {
  await focusService.remove(auth, id);
}

/** Past sessions, newest first. */
export async function listSessions(auth, { from, to, kind, page, limit }) {
  await currentSession(auth);
  const filter = { active: false };
  if (from || to) {
    if (from && to && to < from) throw fieldError('to', 'end_before_start');
    filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }
  if (kind) filter.kind = kind;
  const { items, total } = await focusService.find(auth, filter, {
    sort: { startedAt: -1 },
    page,
    limit,
  });
  return { items: items.map(serializeFocusSession), total };
}

/** Completed focus time per day: number of sessions and seconds. Breaks are not counted. */
async function focusByDay(userId, from, to) {
  const rows = await FocusSession.aggregate([
    {
      $match: {
        userId,
        deletedAt: null,
        kind: 'focus',
        status: 'completed',
        date: { $gte: from, $lte: to },
      },
    },
    { $group: { _id: '$date', sessions: { $sum: 1 }, seconds: { $sum: '$elapsedSeconds' } } },
  ]);
  return new Map(rows.map((row) => [row._id, { sessions: row.sessions, seconds: row.seconds }]));
}

/** Focus time day by day over a range, with totals. */
export async function getFocusStats(auth, { from, to }) {
  if (to < from) throw fieldError('to', 'end_before_start');
  if (diffDays(from, to) > MAX_RANGE_DAYS) {
    throw fieldError('to', 'range_too_long', { maximum: MAX_RANGE_DAYS });
  }
  await currentSession(auth);
  const byDay = await focusByDay(auth.userId, from, to);
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push({ date, ...(byDay.get(date) ?? { sessions: 0, seconds: 0 }) });
  }
  return {
    from,
    to,
    days,
    sessions: days.reduce((sum, day) => sum + day.sessions, 0),
    seconds: days.reduce((sum, day) => sum + day.seconds, 0),
  };
}

/**
 * Everything the timer screen needs: the active session, the user's timer lengths, today's
 * and the last seven days' focus time, what would sensibly come next, and the server's
 * clock, so a client can draw the countdown without trusting its own.
 */
export async function getFocusState(auth) {
  const [calendar, preferences, active] = await Promise.all([
    getUserCalendar(auth.userId),
    getUserPreferences(auth.userId),
    currentSession(auth),
  ]);
  const { today } = calendar;
  const settings = focusPreferences(preferences);
  const [byDay, last] = await Promise.all([
    focusByDay(auth.userId, addDays(today, -6), today),
    FocusSession.findOne({
      userId: auth.userId,
      deletedAt: null,
      active: false,
      status: 'completed',
      date: today,
    }).sort({ endedAt: -1 }),
  ]);

  const week = [];
  for (let date = addDays(today, -6); date <= today; date = addDays(date, 1)) {
    week.push({ date, ...(byDay.get(date) ?? { sessions: 0, seconds: 0 }) });
  }
  const todayFigures = week.at(-1);

  // After a focus session comes a break — a long one after every `longBreakEvery` sessions
  // of the day; after a break, or at the start of the day, comes focus.
  let suggestedKind = 'focus';
  if (last?.kind === 'focus') {
    suggestedKind =
      todayFigures.sessions % settings.longBreakEvery === 0 ? 'long_break' : 'short_break';
  }

  return {
    serverTime: new Date().toISOString(),
    today,
    session: active ? serializeFocusSession(active) : null,
    settings,
    suggestedKind,
    todayFocus: { sessions: todayFigures.sessions, seconds: todayFigures.seconds },
    week,
  };
}
