import {
  CALENDAR_EVENT_KINDS,
  CALENDAR_ITEM_KINDS,
  HABIT_DAY_STATES,
  TASK_STATUSES,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { recurrenceSchema } from '../../core/recurrence.js';
import { createModule } from '../../core/routing.js';
import {
  baseVersionSchema,
  hexColorSchema,
  idSchema,
  localDateSchema,
  timeOfDaySchema,
  timeZoneSchema,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import { MAX_REMINDERS } from './calendar-event.model.js';
import {
  createEvent,
  deleteEvent,
  excludeOccurrence,
  getCalendar,
  getEvent,
  moveEvent,
  updateEvent,
} from './calendar.service.js';

export const calendarEventSchema = z
  .strictObject({
    ...syncedResourceFields,
    title: z.string(),
    description: z.string(),
    location: z.string(),
    categoryId: z.string().nullable(),
    color: z.string().nullable(),
    kind: z.enum(CALENDAR_EVENT_KINDS),
    allDay: z.boolean(),
    timeZone: z.string().describe('IANA zone the wall-clock times of the event are written in'),
    startDate: z.string().describe('Date of the first (or only) occurrence, in `timeZone`'),
    startTime: z.string().nullable().describe('HH:mm; null for all-day events'),
    endDate: z.string().describe('Inclusive for all-day events'),
    endTime: z.string().nullable(),
    recurrence: recurrenceSchema.nullable(),
    recurrenceEndDate: z.string().nullable(),
    excludedDates: z.array(z.string()).describe('Occurrences removed from the series'),
    reminderMinutes: z.array(z.number()),
    taskId: z.string().nullable(),
    habitId: z.string().nullable(),
    goalId: z.string().nullable(),
  })
  .describe('Calendar event');

export const calendarItemSchema = z
  .strictObject({
    id: z.string().describe('Unique within a response: `<kind>:<sourceId>:<date>`'),
    kind: z.enum(CALENDAR_ITEM_KINDS),
    sourceId: z.string().describe('Id of the event, task or habit'),
    occurrenceDate: z
      .string()
      .nullable()
      .describe('For events: the occurrence within its series, as a date in the event’s zone'),
    title: z.string(),
    color: z.string().nullable(),
    categoryId: z.string().nullable(),
    eventKind: z.enum(CALENDAR_EVENT_KINDS).nullable(),
    recurring: z.boolean(),
    location: z.string(),
    status: z
      .union([z.enum(TASK_STATUSES), z.enum(HABIT_DAY_STATES)])
      .nullable()
      .describe('Task status or habit day state; null for events'),
    allDay: z.boolean(),
    date: z.string().describe('Start date in the viewer’s time zone'),
    startTime: z.string().nullable().describe('Start time in the viewer’s time zone'),
    endDate: z.string(),
    endTime: z.string().nullable(),
    startsAt: z.string().nullable().describe('Start instant (UTC); null for all-day items'),
    endsAt: z.string().nullable(),
  })
  .describe(
    'One entry of the unified calendar, already positioned in the viewer’s time zone. ' +
      'Clients lay items out from `date`, `startTime`, `endDate` and `endTime`.',
  );

const eventResultSchema = z.strictObject({
  event: calendarEventSchema,
  conflicts: z
    .array(calendarItemSchema)
    .describe('Other timed items that overlap this event in the coming weeks. A warning only.'),
});

const eventFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000),
  location: z.string().trim().max(200),
  categoryId: idSchema.nullable(),
  color: hexColorSchema.nullable(),
  kind: z.enum(CALENDAR_EVENT_KINDS),
  allDay: z.boolean(),
  timeZone: timeZoneSchema,
  startDate: localDateSchema,
  startTime: timeOfDaySchema.nullable(),
  endDate: localDateSchema,
  endTime: timeOfDaySchema.nullable(),
  recurrence: recurrenceSchema.nullable(),
  recurrenceEndDate: localDateSchema.nullable(),
  reminderMinutes: z.array(z.int().min(0).max(40320)).max(MAX_REMINDERS),
  taskId: idSchema.nullable(),
  habitId: idSchema.nullable(),
  goalId: idSchema.nullable(),
};

const optional = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()]));

const eventParams = z.strictObject({ eventId: idSchema });

const calendar = createModule({
  tag: 'Calendar',
  description:
    'Events and the unified calendar. `GET /calendar` merges events, tasks and habits into ' +
    'display-ready items positioned in the user’s time zone. Timed events keep their ' +
    'wall-clock time in their own zone on every occurrence.',
  basePath: '/calendar',
});

calendar.get(
  '',
  {
    summary: 'Get the unified calendar for a date range',
    description:
      'At most 62 days. Returns every occurrence of repeating events, tasks by their time ' +
      'block or due date, habits on the days they are due, and the pairs of timed items ' +
      'that overlap.',
    query: z.strictObject({
      from: localDateSchema,
      to: localDateSchema,
      include: z
        .string()
        .default(CALENDAR_ITEM_KINDS.join(','))
        .transform((value) => value.split(',').filter(Boolean))
        .pipe(z.array(z.enum(CALENDAR_ITEM_KINDS)))
        .describe('Comma-separated item kinds: event, task, habit'),
    }),
    response: z.strictObject({
      from: z.string(),
      to: z.string(),
      today: z.string(),
      timeZone: z.string().describe('The zone all item dates and times are expressed in'),
      items: z.array(calendarItemSchema),
      conflicts: z
        .array(z.tuple([z.string(), z.string()]))
        .describe('Pairs of item ids whose time ranges overlap'),
    }),
  },
  ({ auth, query }) => getCalendar(auth, query),
);

calendar.post(
  '/events',
  {
    summary: 'Create an event',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      title: eventFields.title,
      description: eventFields.description.default(''),
      location: eventFields.location.default(''),
      categoryId: eventFields.categoryId.default(null),
      color: eventFields.color.default(null),
      kind: eventFields.kind.default('event'),
      allDay: eventFields.allDay.default(false),
      timeZone: eventFields.timeZone.optional().describe('Defaults to the user’s time zone'),
      startDate: eventFields.startDate,
      startTime: eventFields.startTime.default(null),
      endDate: eventFields.endDate.optional().describe('Defaults to the start date'),
      endTime: eventFields.endTime.default(null),
      recurrence: eventFields.recurrence.default(null),
      recurrenceEndDate: eventFields.recurrenceEndDate.default(null),
      reminderMinutes: eventFields.reminderMinutes.default([]),
      taskId: eventFields.taskId.default(null),
      habitId: eventFields.habitId.default(null),
      goalId: eventFields.goalId.default(null),
    }),
    response: eventResultSchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createEvent(auth, body),
);

calendar.get(
  '/events/:eventId',
  {
    summary: 'Get an event',
    params: eventParams,
    response: calendarEventSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => getEvent(auth, params.eventId),
);

calendar.patch(
  '/events/:eventId',
  {
    summary: 'Update an event',
    description:
      'Partial update of the event, or of the whole series for a repeating event. ' +
      '`recurrence: null` ends the series.',
    params: eventParams,
    body: z.strictObject({ ...optional(eventFields), baseVersion: baseVersionSchema }),
    response: eventResultSchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params, body }) => updateEvent(auth, params.eventId, body),
);

calendar.delete(
  '/events/:eventId',
  {
    summary: 'Delete an event (the whole series for a repeating event)',
    params: eventParams,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => deleteEvent(auth, params.eventId),
);

calendar.post(
  '/events/:eventId/move',
  {
    summary: 'Reschedule an event by day and time',
    description:
      'Places the event on `date` (and `startTime`) of the user’s calendar, keeping its ' +
      'length. For a repeating event `occurrenceDate` is required: that occurrence leaves ' +
      'the series and becomes an event of its own, which is returned.',
    params: eventParams,
    body: z.strictObject({
      date: localDateSchema.describe('New start date in the user’s time zone'),
      startTime: timeOfDaySchema
        .optional()
        .describe('New start time in the user’s time zone; omitted keeps the time'),
      occurrenceDate: localDateSchema
        .optional()
        .describe('Which occurrence of a repeating event is moved'),
    }),
    response: eventResultSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, body }) => moveEvent(auth, params.eventId, body),
);

calendar.delete(
  '/events/:eventId/occurrences/:date',
  {
    summary: 'Remove one occurrence of a repeating event',
    params: z.strictObject({ eventId: idSchema, date: localDateSchema }),
    response: calendarEventSchema,
    errors: ['NOT_FOUND', 'INVALID_STATE', 'LIMIT_EXCEEDED'],
  },
  ({ auth, params }) => excludeOccurrence(auth, params.eventId, params.date),
);

export const calendarRouter = calendar.router;
