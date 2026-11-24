import {
  HABIT_DAY_STATES,
  HABIT_ENTRY_STATUSES,
  HABIT_PERIODS,
  HABIT_SCHEDULE_MODES,
  HABIT_TARGET_KINDS,
  ITEM_ICONS,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { recurrencePatchSchema, recurrenceSchema } from '../../core/recurrence.js';
import {
  baseVersionSchema,
  hexColorSchema,
  idSchema,
  localDateSchema,
  timeOfDaySchema,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';

const reminderSchema = z.strictObject({
  time: timeOfDaySchema,
  enabled: z.boolean().default(true),
});

const scheduleSchema = z
  .strictObject({
    mode: z.enum(HABIT_SCHEDULE_MODES),
    recurrence: recurrenceSchema,
    period: z.enum(HABIT_PERIODS),
    timesPerPeriod: z.int().min(1).max(31),
  })
  .describe(
    'When the habit is expected. `fixed`: on the dates of `recurrence`. `flexible`: ' +
      '`timesPerPeriod` times per `period` (week or month), on any days.',
  );

const targetSchema = z
  .strictObject({
    kind: z.enum(HABIT_TARGET_KINDS),
    value: z.number().min(1).max(100000),
    unit: z.string().trim().max(20),
  })
  .describe(
    'What completes the habit for a day. `check`: done once. `count`: `value` repetitions. ' +
      '`duration`: `value` minutes.',
  );

export const habitSchema = z
  .strictObject({
    ...syncedResourceFields,
    name: z.string(),
    description: z.string(),
    categoryId: z.string().nullable(),
    color: z.string(),
    icon: z.enum(ITEM_ICONS),
    schedule: scheduleSchema,
    target: targetSchema,
    startDate: z.string().describe('First day, YYYY-MM-DD in the user’s time zone'),
    endDate: z.string().nullable(),
    reminders: z.array(z.strictObject({ time: z.string(), enabled: z.boolean() })),
    streakGoal: z.number().nullable(),
    archived: z.boolean(),
    archivedAt: z.string().nullable(),
    sortOrder: z.number(),
  })
  .describe('Habit');

const defaultRecurrence = { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] };

export const createHabitBody = z.strictObject({
  id: idSchema.optional().describe('Optional client-generated id'),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  categoryId: idSchema.nullable().default(null),
  color: hexColorSchema,
  icon: z.enum(ITEM_ICONS).default('star'),
  schedule: z
    .strictObject({
      mode: z.enum(HABIT_SCHEDULE_MODES).default('fixed'),
      recurrence: recurrenceSchema.default(defaultRecurrence),
      period: z.enum(HABIT_PERIODS).default('week'),
      timesPerPeriod: z.int().min(1).max(31).default(1),
    })
    .default({ mode: 'fixed', recurrence: defaultRecurrence, period: 'week', timesPerPeriod: 1 }),
  target: z
    .strictObject({
      kind: z.enum(HABIT_TARGET_KINDS).default('check'),
      value: z.number().min(1).max(100000).default(1),
      unit: z.string().trim().max(20).default(''),
    })
    .default({ kind: 'check', value: 1, unit: '' }),
  startDate: localDateSchema.optional().describe('Defaults to today in the user’s time zone'),
  endDate: localDateSchema.nullable().default(null),
  reminders: z.array(reminderSchema).max(8).default([]),
  streakGoal: z.int().min(1).max(3650).nullable().default(null),
  sortOrder: z.number().min(0).max(100000).default(0),
});

export const updateHabitBody = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  categoryId: idSchema.nullable().optional(),
  color: hexColorSchema.optional(),
  icon: z.enum(ITEM_ICONS).optional(),
  schedule: z
    .strictObject({
      mode: z.enum(HABIT_SCHEDULE_MODES).optional(),
      recurrence: recurrencePatchSchema.optional(),
      period: z.enum(HABIT_PERIODS).optional(),
      timesPerPeriod: z.int().min(1).max(31).optional(),
    })
    .optional(),
  target: z
    .strictObject({
      kind: z.enum(HABIT_TARGET_KINDS).optional(),
      value: z.number().min(1).max(100000).optional(),
      unit: z.string().trim().max(20).optional(),
    })
    .optional(),
  startDate: localDateSchema.optional(),
  endDate: localDateSchema.nullable().optional(),
  reminders: z.array(reminderSchema).max(8).optional(),
  streakGoal: z.int().min(1).max(3650).nullable().optional(),
  sortOrder: z.number().min(0).max(100000).optional(),
  baseVersion: baseVersionSchema,
});

export const habitEntrySchema = z
  .strictObject({
    ...syncedResourceFields,
    habitId: z.string(),
    date: z.string(),
    status: z.enum(HABIT_ENTRY_STATUSES),
    value: z.number(),
    target: z.number().describe('The habit’s target when the entry was written'),
    completed: z.boolean(),
    note: z.string(),
    postponedTo: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .describe('What was recorded for a habit on one day');

export const setEntryBody = z
  .strictObject({
    status: z.enum(HABIT_ENTRY_STATUSES).optional().describe('Defaults to `active`'),
    value: z.number().min(0).max(1000000).optional().describe('Absolute progress for the day'),
    increment: z
      .number()
      .min(-1000000)
      .max(1000000)
      .optional()
      .describe('Change relative to the stored progress, applied atomically'),
    note: z.string().trim().max(500).optional(),
    postponedTo: localDateSchema.optional().describe('Required when status is `postponed`'),
  })
  .refine((body) => body.value === undefined || body.increment === undefined, {
    path: ['increment'],
    message: 'v:invalid',
  });

const streakSchema = z.strictObject({
  current: z.int(),
  best: z.int(),
  unit: z.enum(['days', 'weeks', 'months']),
});

const periodSchema = z
  .strictObject({
    from: z.string(),
    to: z.string(),
    completed: z.int(),
    target: z.int(),
    met: z.boolean(),
  })
  .describe('Progress of a flexible habit in the current week or month');

export const habitDaySchema = z
  .strictObject({
    habitId: z.string(),
    date: z.string(),
    state: z.enum(HABIT_DAY_STATES),
    due: z.boolean(),
    value: z.number(),
    target: z.number(),
    progress: z.number().describe('value / target, capped at 1'),
    entry: habitEntrySchema.nullable(),
    period: periodSchema.nullable(),
    streak: streakSchema,
    habit: habitSchema,
  })
  .describe('A habit on one day');

export const daySchema = z.strictObject({
  date: z.string(),
  today: z.string().describe('Today in the user’s time zone'),
  items: z.array(habitDaySchema),
  summary: z.strictObject({
    due: z.int().describe('Due habits that are neither skipped nor postponed'),
    completed: z.int(),
    skipped: z.int(),
    postponed: z.int(),
    rate: z.number().nullable().describe('completed / due; null when nothing is due'),
  }),
});

export const historySchema = z.strictObject({
  habitId: z.string(),
  from: z.string(),
  to: z.string(),
  today: z.string(),
  days: z.array(
    z.strictObject({
      date: z.string(),
      state: z.enum(HABIT_DAY_STATES),
      due: z.boolean(),
      value: z.number(),
      target: z.number(),
      note: z.string(),
      entryId: z.string().nullable(),
    }),
  ),
});

const completionSchema = {
  due: z.int(),
  completed: z.int(),
  missed: z.int(),
  skipped: z.int(),
  postponed: z.int(),
  extra: z.int().describe('Completions on days the habit was not due'),
  rate: z
    .number()
    .nullable()
    .describe('completed / due. Skipped, postponed and still-open days are excluded'),
};

export const statsSchema = z.strictObject({
  habitId: z.string(),
  today: z.string(),
  streak: streakSchema,
  streakGoal: z.number().nullable(),
  totalCompletions: z.int(),
  totalValue: z.number(),
  windows: z.array(z.strictObject({ days: z.int(), ...completionSchema })),
  byWeekday: z.array(z.strictObject({ weekday: z.int(), due: z.int(), completed: z.int() })),
  unit: z.enum(['days', 'weeks', 'months']),
});
