import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { idSchema, localDateSchema } from '../../core/validation.js';
import {
  createHabitBody,
  daySchema,
  habitDaySchema,
  habitSchema,
  historySchema,
  setEntryBody,
  statsSchema,
  updateHabitBody,
} from './habits.schemas.js';
import {
  clearEntry,
  createHabit,
  deleteHabit,
  getDay,
  getHabit,
  getHabitHistory,
  getHabitStats,
  listHabits,
  setEntry,
  setHabitArchived,
  updateHabit,
} from './habits.service.js';

const habitParams = z.strictObject({ habitId: idSchema });
const entryParams = z.strictObject({ habitId: idSchema, date: localDateSchema });

const habits = createModule({
  tag: 'Habits',
  description:
    'Habits, their schedules and what was recorded for them day by day. Every date is a ' +
    'calendar day in the user’s configured time zone; the server decides what "today" is ' +
    'and reports it in the responses.',
  basePath: '/habits',
});

habits.get(
  '',
  {
    summary: 'List habits',
    query: z.strictObject({
      archived: z
        .enum(['true', 'false', 'all'])
        .default('false')
        .describe('Archived habits only, active only (default) or both'),
      categoryId: idSchema.optional(),
    }),
    response: z.array(habitSchema),
  },
  ({ auth, query }) => listHabits(auth, query),
);

habits.post(
  '',
  {
    summary: 'Create a habit',
    body: createHabitBody,
    response: habitSchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createHabit(auth, body),
);

habits.get(
  '/day',
  {
    summary: 'Get the habits of one day',
    description:
      'Each habit that is due on the day, belongs to an active flexible schedule, or has ' +
      'something recorded, with its state, progress and current streak. Defaults to today ' +
      'in the user’s time zone.',
    query: z.strictObject({ date: localDateSchema.optional() }),
    response: daySchema,
  },
  ({ auth, query }) => getDay(auth, query.date),
);

habits.get(
  '/:habitId',
  { summary: 'Get a habit', params: habitParams, response: habitSchema, errors: ['NOT_FOUND'] },
  ({ auth, params }) => getHabit(auth, params.habitId),
);

habits.patch(
  '/:habitId',
  {
    summary: 'Update a habit',
    description: 'Partial update. `schedule` and `target` are merged key by key.',
    params: habitParams,
    body: updateHabitBody,
    response: habitSchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params, body }) => updateHabit(auth, params.habitId, body),
);

habits.delete(
  '/:habitId',
  {
    summary: 'Delete a habit and its recorded entries',
    params: habitParams,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => deleteHabit(auth, params.habitId),
);

habits.post(
  '/:habitId/archive',
  {
    summary: 'Archive a habit',
    description: 'An archived habit keeps its history but no longer appears in daily views.',
    params: habitParams,
    response: habitSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => setHabitArchived(auth, params.habitId, true),
);

habits.post(
  '/:habitId/unarchive',
  {
    summary: 'Restore an archived habit',
    params: habitParams,
    response: habitSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => setHabitArchived(auth, params.habitId, false),
);

habits.get(
  '/:habitId/history',
  {
    summary: 'Day-by-day states of a habit',
    description: 'At most 400 days per request.',
    params: habitParams,
    query: z.strictObject({ from: localDateSchema, to: localDateSchema }),
    response: historySchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, query }) => getHabitHistory(auth, params.habitId, query),
);

habits.get(
  '/:habitId/stats',
  {
    summary: 'Streaks and completion figures of a habit',
    description:
      'Streaks count consecutive completed due days (fixed schedules) or periods that met ' +
      'their quota (flexible schedules). Skipped and postponed days never break a streak; ' +
      'neither does a today that is still open.',
    params: habitParams,
    response: statsSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => getHabitStats(auth, params.habitId),
);

habits.put(
  '/:habitId/entries/:date',
  {
    summary: 'Record progress, a skip, a postponement or a note for a day',
    description:
      'Creates the entry of that day or updates it. Send `value` for absolute progress or ' +
      '`increment` to add to the stored progress. `status: "skipped"` excuses the day; ' +
      '`status: "postponed"` with `postponedTo` moves the occurrence to a later day.',
    params: entryParams,
    body: setEntryBody,
    response: habitDaySchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, body }) => setEntry(auth, params.habitId, params.date, body),
);

habits.delete(
  '/:habitId/entries/:date',
  {
    summary: 'Remove what was recorded for a day',
    params: entryParams,
    response: habitDaySchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => clearEntry(auth, params.habitId, params.date),
);

export const habitsRouter = habits.router;
