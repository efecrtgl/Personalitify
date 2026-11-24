import { ENTITY_TYPES, ERROR_CODES } from '@personalitify/shared-contracts';
import { DateTime } from 'luxon';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { assertOwnedReferences, detachOnDelete } from '../../core/entity/references.js';
import { conflict, fieldError, limitExceeded } from '../../core/errors.js';
import { occursOn } from '../../core/recurrence.js';
import {
  addDays,
  diffDays,
  eachDate,
  instantAt,
  isValidTimeZone,
  localDateInZone,
  localTimeInZone,
} from '../../core/time.js';
import { assertCategory } from '../categories/categories.service.js';
import { goalService } from '../goals/goals.service.js';
import { dayState, indexEntries } from '../habits/habit-schedule.js';
import { Habit, HabitEntry } from '../habits/habit.model.js';
import { getUserCalendar, habitService } from '../habits/habits.service.js';
import { Task } from '../tasks/task.model.js';
import { taskService } from '../tasks/tasks.service.js';
import {
  CalendarEvent,
  MAX_EXCLUDED_DATES,
  serializeCalendarEvent,
} from './calendar-event.model.js';
import { compareItems, expandEvent, findConflicts, habitItem, taskItem } from './calendar-items.js';

export const calendarEventService = createEntityService({
  entityType: ENTITY_TYPES.CALENDAR_EVENT,
  model: CalendarEvent,
  serialize: serializeCalendarEvent,
  maxPerUser: 5000,
});

for (const [field, targetType] of [
  ['categoryId', ENTITY_TYPES.CATEGORY],
  ['taskId', ENTITY_TYPES.TASK],
  ['habitId', ENTITY_TYPES.HABIT],
  ['goalId', ENTITY_TYPES.GOAL],
]) {
  detachOnDelete({ service: calendarEventService, field, targetType });
}

/** Longest range one calendar request may cover. */
export const MAX_RANGE_DAYS = 62;
/** Longest single event. */
const MAX_EVENT_DAYS = 31;
/** How far ahead a new or changed event is checked for overlaps. */
const CONFLICT_HORIZON_DAYS = 60;

async function assertReferences(auth, input) {
  if (input.categoryId !== undefined) await assertCategory(auth, input.categoryId);
  if (input.taskId !== undefined) {
    await assertOwnedReferences(auth, taskService, input.taskId, 'taskId');
  }
  if (input.habitId !== undefined) {
    await assertOwnedReferences(auth, habitService, input.habitId, 'habitId');
  }
  if (input.goalId !== undefined) {
    await assertOwnedReferences(auth, goalService, input.goalId, 'goalId');
  }
}

/** Validates the timing of an event and normalizes the fields an all-day event has no use for. */
function normalizeTiming(event) {
  if (!isValidTimeZone(event.timeZone)) throw fieldError('timeZone', 'invalid_time_zone');
  if (event.endDate < event.startDate) throw fieldError('endDate', 'end_before_start');
  if (diffDays(event.startDate, event.endDate) > MAX_EVENT_DAYS) {
    throw fieldError('endDate', 'range_too_long', { maximum: MAX_EVENT_DAYS });
  }
  if (event.allDay) {
    event.startTime = null;
    event.endTime = null;
  } else {
    if (!event.startTime) throw fieldError('startTime', 'required');
    if (!event.endTime) throw fieldError('endTime', 'required');
    if (event.endDate === event.startDate && event.endTime <= event.startTime) {
      throw fieldError('endTime', 'end_before_start');
    }
  }
  if (event.recurring && event.recurrenceEndDate && event.recurrenceEndDate < event.startDate) {
    throw fieldError('recurrenceEndDate', 'end_before_start');
  }
}

// --- The unified calendar ---------------------------------------------------------------

async function eventItems(userId, from, to, timeZone) {
  const events = await CalendarEvent.find({
    userId,
    deletedAt: null,
    startDate: { $lte: addDays(to, 1) },
    $or: [
      { recurring: false, endDate: { $gte: addDays(from, -1) } },
      { recurring: true, recurrenceEndDate: null },
      { recurring: true, recurrenceEndDate: { $gte: addDays(from, -MAX_EVENT_DAYS - 1) } },
    ],
  });
  return events.flatMap((event) => expandEvent(event, from, to, timeZone));
}

async function taskItems(userId, from, to, timeZone) {
  const range = { $gte: from, $lte: to };
  const tasks = await Task.find({
    userId,
    deletedAt: null,
    status: { $ne: 'cancelled' },
    $or: [{ scheduledDate: range }, { scheduledDate: null, dueDate: range }],
  });
  return tasks.map((task) => taskItem(task, timeZone));
}

async function habitItems(userId, from, to, today) {
  const habits = await Habit.find({
    userId,
    deletedAt: null,
    archivedAt: null,
    'schedule.mode': 'fixed',
    startDate: { $lte: to },
  });
  if (habits.length === 0) return [];
  const entries = await HabitEntry.find({
    userId,
    deletedAt: null,
    habitId: { $in: habits.map((habit) => String(habit._id)) },
    $or: [{ date: { $gte: from, $lte: to } }, { postponedTo: { $gte: from, $lte: to } }],
  });
  const byHabit = new Map();
  for (const entry of entries) {
    byHabit.set(entry.habitId, [...(byHabit.get(entry.habitId) ?? []), entry]);
  }

  const items = [];
  for (const habit of habits) {
    const index = indexEntries(byHabit.get(String(habit._id)) ?? []);
    for (const date of eachDate(from, to)) {
      const { state, due } = dayState(habit, date, index, today);
      // Shown on the days it is due; a postponed occurrence appears on the day it moved to.
      if (due && state !== 'postponed') items.push(habitItem(habit, date, state));
    }
  }
  return items;
}

/**
 * Everything on the user's calendar between two dates: events (with every occurrence of a
 * series), tasks by their time block or due date, and habits on the days they are due.
 */
export async function getCalendar(auth, { from, to, include }) {
  if (to < from) throw fieldError('to', 'end_before_start');
  if (diffDays(from, to) > MAX_RANGE_DAYS) {
    throw fieldError('to', 'range_too_long', { maximum: MAX_RANGE_DAYS });
  }
  const { timeZone, today } = await getUserCalendar(auth.userId);
  const wanted = new Set(include);

  const groups = await Promise.all([
    wanted.has('event') ? eventItems(auth.userId, from, to, timeZone) : [],
    wanted.has('task') ? taskItems(auth.userId, from, to, timeZone) : [],
    wanted.has('habit') ? habitItems(auth.userId, from, to, today) : [],
  ]);
  const items = groups.flat().sort(compareItems);
  return { from, to, today, timeZone, items, conflicts: findConflicts(items) };
}

/** Other timed items that overlap any occurrence of `event` in the coming weeks. */
async function conflictsOf(auth, event) {
  if (event.allDay) return [];
  const { timeZone } = await getUserCalendar(auth.userId);
  const from = addDays(event.startDate, -1);
  const to = addDays(from, event.recurring ? CONFLICT_HORIZON_DAYS : MAX_EVENT_DAYS + 2);
  const [events, tasks] = await Promise.all([
    eventItems(auth.userId, from, to, timeZone),
    taskItems(auth.userId, from, to, timeZone),
  ]);
  const items = [...events, ...tasks];
  const own = new Set(
    items.filter((item) => item.sourceId === String(event._id)).map((item) => item.id),
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  const others = new Map();
  for (const [a, b] of findConflicts(items)) {
    if (own.has(a) && !own.has(b)) others.set(b, byId.get(b));
    if (own.has(b) && !own.has(a)) others.set(a, byId.get(a));
  }
  return [...others.values()].sort(compareItems);
}

const withConflicts = async (auth, event) => ({
  event: serializeCalendarEvent(event),
  conflicts: await conflictsOf(auth, event),
});

// --- Events ----------------------------------------------------------------------------

export async function createEvent(auth, { id, recurrence, ...input }) {
  await assertReferences(auth, input);
  const { timeZone } = await getUserCalendar(auth.userId);
  const attributes = {
    ...input,
    timeZone: input.timeZone ?? timeZone,
    endDate: input.endDate ?? input.startDate,
    recurring: Boolean(recurrence),
    ...(recurrence ? { recurrence } : {}),
  };
  normalizeTiming(attributes);
  return withConflicts(auth, await calendarEventService.create(auth, attributes, { id }));
}

export async function getEvent(auth, id) {
  return serializeCalendarEvent(await calendarEventService.getById(auth, id));
}

export async function updateEvent(auth, id, { baseVersion, recurrence, ...patch }) {
  await assertReferences(auth, patch);
  const intendedFields = [
    ...Object.keys(patch),
    ...(recurrence !== undefined ? ['recurrence', 'recurring'] : []),
  ];
  const { document } = await calendarEventService.mutate(
    auth,
    id,
    (event) => {
      assignPatch(event, patch);
      if (recurrence === null) {
        event.recurring = false;
        event.recurrenceEndDate = null;
        event.excludedDates = [];
      } else if (recurrence !== undefined) {
        event.set('recurrence', recurrence);
        event.recurring = true;
      }
      normalizeTiming(event);
    },
    { baseVersion, intendedFields },
  );
  return withConflicts(auth, document);
}

export async function deleteEvent(auth, id) {
  await calendarEventService.remove(auth, id);
}

function assertOccurrence(event, date) {
  const exists = event.recurring
    ? occursOn(event.recurrence, event.startDate, date) &&
      (!event.recurrenceEndDate || date <= event.recurrenceEndDate) &&
      !event.excludedDates.includes(date)
    : date === event.startDate;
  if (!exists) throw fieldError('occurrenceDate', 'unknown_reference');
}

/** Removes one occurrence from a repeating event; the rest of the series is unaffected. */
export async function excludeOccurrence(auth, id, date) {
  const { document } = await calendarEventService.mutate(
    auth,
    id,
    (event) => {
      if (!event.recurring) throw conflict(ERROR_CODES.INVALID_STATE);
      assertOccurrence(event, date);
      if (event.excludedDates.length >= MAX_EXCLUDED_DATES) {
        throw limitExceeded({ details: { limit: MAX_EXCLUDED_DATES } });
      }
      event.excludedDates = [...event.excludedDates, date];
    },
    { intendedFields: ['excludedDates'] },
  );
  return serializeCalendarEvent(document);
}

/**
 * Where an event lands when it is dropped on `date` (and `startTime`) of the viewer's
 * calendar, keeping its length. Returns the new timing in the event's own time zone.
 */
function movedTiming(event, occurrenceDate, { date, startTime }, viewerZone) {
  const spanDays = diffDays(event.startDate, event.endDate);
  if (event.allDay) {
    return { startDate: date, endDate: addDays(date, spanDays), startTime: null, endTime: null };
  }
  const oldStart = instantAt(occurrenceDate, event.startTime, event.timeZone);
  const oldEnd = instantAt(addDays(occurrenceDate, spanDays), event.endTime, event.timeZone);
  // Without a new time the event keeps the wall-clock time it is shown at to the viewer.
  const time = startTime ?? localTimeInZone(oldStart, viewerZone);
  const newStart = DateTime.fromISO(`${date}T${time}`, { zone: viewerZone });
  const newEnd = newStart.plus({ milliseconds: oldEnd - oldStart }).toJSDate();
  const start = newStart.toJSDate();
  return {
    startDate: localDateInZone(start, event.timeZone),
    startTime: localTimeInZone(start, event.timeZone),
    endDate: localDateInZone(newEnd, event.timeZone),
    endTime: localTimeInZone(newEnd, event.timeZone),
  };
}

/**
 * Reschedules an event by dropping it on another day or time.
 *
 * A one-off event is moved. For a repeating event the dragged occurrence is taken out of the
 * series and becomes an event of its own at the new position; the series itself is changed
 * by editing it.
 */
export async function moveEvent(auth, id, { date, startTime, occurrenceDate }) {
  const { timeZone: viewerZone } = await getUserCalendar(auth.userId);
  const event = await calendarEventService.getById(auth, id);

  if (!event.recurring) {
    const timing = movedTiming(event, event.startDate, { date, startTime }, viewerZone);
    const { document } = await calendarEventService.mutate(
      auth,
      id,
      (target) => {
        target.set(timing);
        normalizeTiming(target);
      },
      { intendedFields: Object.keys(timing) },
    );
    return withConflicts(auth, document);
  }

  if (!occurrenceDate) throw fieldError('occurrenceDate', 'required');
  assertOccurrence(event, occurrenceDate);
  const timing = movedTiming(event, occurrenceDate, { date, startTime }, viewerZone);
  await excludeOccurrence(auth, id, occurrenceDate);
  const single = await calendarEventService.create(auth, {
    title: event.title,
    description: event.description,
    location: event.location,
    categoryId: event.categoryId,
    color: event.color,
    kind: event.kind,
    allDay: event.allDay,
    timeZone: event.timeZone,
    reminderMinutes: [...event.reminderMinutes],
    taskId: event.taskId,
    habitId: event.habitId,
    goalId: event.goalId,
    recurring: false,
    ...timing,
  });
  return withConflicts(auth, single);
}
