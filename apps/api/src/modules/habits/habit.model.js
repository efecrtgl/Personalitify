import {
  HABIT_ENTRY_STATUSES,
  HABIT_PERIODS,
  HABIT_SCHEDULE_MODES,
  HABIT_TARGET_KINDS,
  ITEM_ICONS,
} from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { recurrenceFields, serializeRecurrence } from '../../core/recurrence.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const reminderSchema = new mongoose.Schema(
  {
    time: { type: String, required: true, match: TIME_OF_DAY },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const habitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    categoryId: { type: String, default: null },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    icon: { type: String, enum: ITEM_ICONS, default: 'star' },

    schedule: {
      mode: { type: String, enum: HABIT_SCHEDULE_MODES, required: true },
      // Fixed mode: the dates the habit is due on.
      recurrence: recurrenceFields,
      // Flexible mode: how many times per week or month, on any days.
      period: { type: String, enum: HABIT_PERIODS, default: 'week' },
      timesPerPeriod: { type: Number, default: 1, min: 1, max: 31 },
    },

    // What "done for the day" means.
    target: {
      kind: { type: String, enum: HABIT_TARGET_KINDS, default: 'check' },
      value: { type: Number, default: 1, min: 1, max: 100000 },
      unit: { type: String, default: '', trim: true, maxlength: 20 },
    },

    // Calendar dates in the user's time zone.
    startDate: { type: String, required: true, match: LOCAL_DATE },
    endDate: { type: String, default: null, match: LOCAL_DATE },

    // Bounded: at most eight reminder times per habit.
    reminders: {
      type: [reminderSchema],
      default: [],
      validate: (value) => value.length <= 8,
    },

    // A streak length the user is aiming for; purely motivational.
    streakGoal: { type: Number, default: null, min: 1, max: 3650 },
    archivedAt: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { collection: 'habits' },
);

habitSchema.plugin(syncedEntity);
habitSchema.index({ userId: 1, deletedAt: 1, archivedAt: 1, sortOrder: 1 });
habitSchema.index({ userId: 1, categoryId: 1 });

export const Habit = mongoose.model('Habit', habitSchema);

export function serializeHabit(habit) {
  const { schedule, target } = habit;
  return {
    ...baseResource(habit),
    name: habit.name,
    description: habit.description,
    categoryId: habit.categoryId ?? null,
    color: habit.color,
    icon: habit.icon,
    schedule: {
      mode: schedule.mode,
      recurrence: serializeRecurrence(schedule.recurrence),
      period: schedule.period,
      timesPerPeriod: schedule.timesPerPeriod,
    },
    target: { kind: target.kind, value: target.value, unit: target.unit },
    startDate: habit.startDate,
    endDate: habit.endDate ?? null,
    reminders: habit.reminders.map((reminder) => ({
      time: reminder.time,
      enabled: reminder.enabled,
    })),
    streakGoal: habit.streakGoal ?? null,
    archived: Boolean(habit.archivedAt),
    archivedAt: habit.archivedAt ? habit.archivedAt.toISOString() : null,
    sortOrder: habit.sortOrder,
  };
}

/**
 * What the user recorded for one habit on one calendar day. At most one live entry exists
 * per habit and date. `target` is copied from the habit when the entry is written, so a later
 * change of the habit's target does not rewrite history.
 */
const habitEntrySchema = new mongoose.Schema(
  {
    habitId: { type: String, required: true, immutable: true },
    date: { type: String, required: true, immutable: true, match: LOCAL_DATE },
    status: { type: String, enum: HABIT_ENTRY_STATUSES, default: 'active' },
    value: { type: Number, default: 0, min: 0, max: 1000000 },
    target: { type: Number, required: true, min: 1 },
    note: { type: String, default: '', trim: true, maxlength: 500 },
    postponedTo: { type: String, default: null, match: LOCAL_DATE },
    completedAt: { type: Date, default: null },
  },
  { collection: 'habitCompletions' },
);

habitEntrySchema.plugin(syncedEntity);
habitEntrySchema.index(
  { userId: 1, habitId: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);
habitEntrySchema.index({ userId: 1, date: 1 });
habitEntrySchema.index(
  { userId: 1, postponedTo: 1 },
  { partialFilterExpression: { postponedTo: { $type: 'string' } } },
);

export const HabitEntry = mongoose.model('HabitEntry', habitEntrySchema);

export function isEntryCompleted(entry) {
  return entry.status === 'active' && entry.value >= entry.target;
}

export function serializeHabitEntry(entry) {
  return {
    ...baseResource(entry),
    habitId: entry.habitId,
    date: entry.date,
    status: entry.status,
    value: entry.value,
    target: entry.target,
    completed: isEntryCompleted(entry),
    note: entry.note,
    postponedTo: entry.postponedTo ?? null,
    completedAt: entry.completedAt ? entry.completedAt.toISOString() : null,
  };
}
