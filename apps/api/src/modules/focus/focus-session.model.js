import { FOCUS_KINDS, FOCUS_LIMITS, FOCUS_STATUSES } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One run of the timer: a focus session or a break.
 *
 * Every instant is set by the server. A client never reports how long a session lasted; it
 * asks the server to start, pause, resume or finish, and draws the countdown from the
 * instants it gets back. That is what makes a session look the same on every device and
 * keeps the recorded time honest.
 */
const focusSessionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: FOCUS_KINDS, default: 'focus' },
    status: { type: String, enum: FOCUS_STATUSES, default: 'running' },
    // True while the session is running or paused. Exists so that "one active session per
    // user" can be a unique index; it is never exposed.
    active: { type: Boolean, default: true },

    plannedMinutes: {
      type: Number,
      required: true,
      min: FOCUS_LIMITS.minMinutes,
      max: FOCUS_LIMITS.maxMinutes,
    },
    startedAt: { type: Date, required: true },
    // Set while paused; the time spent paused so far is accumulated in `pausedSeconds`.
    pausedAt: { type: Date, default: null },
    pausedSeconds: { type: Number, default: 0, min: 0 },
    endedAt: { type: Date, default: null },
    // Time actually spent, without pauses; final once the session has ended.
    elapsedSeconds: { type: Number, default: 0, min: 0 },
    // The user's calendar date when the session started, for daily statistics.
    date: { type: String, required: true, match: LOCAL_DATE },

    note: { type: String, default: '', trim: true, maxlength: 500 },
    taskId: { type: String, default: null },
    habitId: { type: String, default: null },
    goalId: { type: String, default: null },
  },
  { collection: 'focusSessions' },
);

focusSessionSchema.plugin(syncedEntity);
focusSessionSchema.index({ userId: 1, deletedAt: 1, date: 1 });
focusSessionSchema.index({ userId: 1, deletedAt: 1, startedAt: -1 });
focusSessionSchema.index({ userId: 1, taskId: 1 });
// At most one running or paused session per user.
focusSessionSchema.index(
  { userId: 1 },
  {
    name: 'one_active_session',
    unique: true,
    partialFilterExpression: { active: true, deletedAt: { $type: 'null' } },
  },
);

export const FocusSession = mongoose.model('FocusSession', focusSessionSchema);

/** Seconds spent in the session up to `now`, pauses left out, never more than planned. */
export function elapsedSecondsAt(session, now = new Date()) {
  if (session.endedAt) return session.elapsedSeconds;
  const until = session.pausedAt ?? now;
  const seconds = Math.floor((until - session.startedAt) / 1000) - session.pausedSeconds;
  return Math.max(0, Math.min(session.plannedMinutes * 60, seconds));
}

/** The instant a running session reaches its planned length; null when it is not running. */
export function endsAtOf(session) {
  if (session.status !== 'running') return null;
  return new Date(
    session.startedAt.getTime() + (session.plannedMinutes * 60 + session.pausedSeconds) * 1000,
  );
}

export function serializeFocusSession(session) {
  const endsAt = endsAtOf(session);
  return {
    ...baseResource(session),
    kind: session.kind,
    status: session.status,
    plannedMinutes: session.plannedMinutes,
    startedAt: session.startedAt.toISOString(),
    pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
    pausedSeconds: session.pausedSeconds,
    endsAt: endsAt ? endsAt.toISOString() : null,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    elapsedSeconds: session.elapsedSeconds,
    date: session.date,
    note: session.note,
    taskId: session.taskId ?? null,
    habitId: session.habitId ?? null,
    goalId: session.goalId ?? null,
  };
}
