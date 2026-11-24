import { DateTime } from 'luxon';
import { occurrencesBetween } from '../../core/recurrence.js';
import { addDays, diffDays, instantAt, localDateInZone, localTimeInZone } from '../../core/time.js';

/**
 * Pure construction of calendar items: the unified, display-ready entries of the calendar.
 *
 * Every item carries its position twice: as instants (`startsAt`, `endsAt`) and as calendar
 * dates and wall-clock times **in the viewing user's time zone**. Clients lay items out from
 * the latter and never do time zone arithmetic of their own.
 */

/** Length assumed for a timed item that has a start but no explicit duration. */
export const DEFAULT_BLOCK_MINUTES = 30;

const addMinutes = (date, time, minutes, zone) =>
  DateTime.fromISO(`${date}T${time}`, { zone }).plus({ minutes }).toJSDate();

function timedPosition(startsAt, endsAt, viewerZone) {
  return {
    allDay: false,
    date: localDateInZone(startsAt, viewerZone),
    startTime: localTimeInZone(startsAt, viewerZone),
    endDate: localDateInZone(endsAt, viewerZone),
    endTime: localTimeInZone(endsAt, viewerZone),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

const allDayPosition = (date, endDate = date) => ({
  allDay: true,
  date,
  startTime: null,
  endDate,
  endTime: null,
  startsAt: null,
  endsAt: null,
});

/** The occurrence of `event` that starts on `occurrenceDate` (a date in the event's zone). */
export function eventOccurrence(event, occurrenceDate, viewerZone) {
  const spanDays = diffDays(event.startDate, event.endDate);
  const endDate = addDays(occurrenceDate, spanDays);
  const position = event.allDay
    ? allDayPosition(occurrenceDate, endDate)
    : timedPosition(
        instantAt(occurrenceDate, event.startTime, event.timeZone),
        instantAt(endDate, event.endTime, event.timeZone),
        viewerZone,
      );
  return {
    id: `event:${event._id}:${occurrenceDate}`,
    kind: 'event',
    sourceId: String(event._id),
    // The date of this occurrence in the event's own zone; identifies it within its series.
    occurrenceDate,
    title: event.title,
    color: event.color ?? null,
    categoryId: event.categoryId ?? null,
    eventKind: event.kind,
    recurring: event.recurring,
    location: event.location,
    status: null,
    ...position,
  };
}

/**
 * All occurrences of `event` that touch the viewer's dates `from`…`to` (inclusive).
 * Excluded occurrences of a series are left out.
 */
export function expandEvent(event, from, to, viewerZone) {
  const spanDays = diffDays(event.startDate, event.endDate);
  // A day of slack on both sides covers the offset between the two time zones.
  const searchFrom = addDays(from, -spanDays - 1);
  const searchTo = addDays(to, 1);

  let dates;
  if (event.recurring) {
    const excluded = new Set(event.excludedDates);
    dates = occurrencesBetween(event.recurrence, event.startDate, searchFrom, searchTo, {
      endDate: event.recurrenceEndDate ?? undefined,
    }).filter((date) => !excluded.has(date));
  } else {
    dates = event.startDate >= searchFrom && event.startDate <= searchTo ? [event.startDate] : [];
  }

  return dates
    .map((date) => eventOccurrence(event, date, viewerZone))
    .filter((item) => item.date <= to && item.endDate >= from);
}

/**
 * A task on the calendar: its planned time block if it has one, otherwise its due date.
 * Task dates and times are the user's own, so they are placed in the viewer's zone.
 */
export function taskItem(task, viewerZone) {
  const base = {
    kind: 'task',
    sourceId: String(task._id),
    occurrenceDate: null,
    title: task.title,
    color: null,
    categoryId: task.categoryId ?? null,
    eventKind: null,
    recurring: task.recurring,
    location: '',
    status: task.status,
  };

  if (task.scheduledDate) {
    const id = `task:${task._id}:${task.scheduledDate}`;
    if (!task.scheduledTime) return { ...base, id, ...allDayPosition(task.scheduledDate) };
    const startsAt = instantAt(task.scheduledDate, task.scheduledTime, viewerZone);
    const endsAt = addMinutes(
      task.scheduledDate,
      task.scheduledTime,
      task.durationMinutes ?? DEFAULT_BLOCK_MINUTES,
      viewerZone,
    );
    return { ...base, id, ...timedPosition(startsAt, endsAt, viewerZone) };
  }

  const id = `task:${task._id}:${task.dueDate}`;
  if (!task.dueTime) return { ...base, id, ...allDayPosition(task.dueDate) };
  const startsAt = instantAt(task.dueDate, task.dueTime, viewerZone);
  const endsAt = addMinutes(task.dueDate, task.dueTime, DEFAULT_BLOCK_MINUTES, viewerZone);
  return { ...base, id, ...timedPosition(startsAt, endsAt, viewerZone) };
}

/** A habit that is due on a day, as an all-day item. */
export function habitItem(habit, date, state) {
  return {
    id: `habit:${habit._id}:${date}`,
    kind: 'habit',
    sourceId: String(habit._id),
    occurrenceDate: date,
    title: habit.name,
    color: habit.color,
    categoryId: habit.categoryId ?? null,
    eventKind: null,
    recurring: true,
    location: '',
    status: state,
    ...allDayPosition(date),
  };
}

/**
 * Pairs of timed items whose time ranges overlap.
 * Habits and all-day items never conflict; touching ends (10:00–11:00 and 11:00–12:00) do
 * not overlap. Finished and cancelled tasks are ignored.
 */
export function findConflicts(items) {
  const timed = items
    .filter(
      (item) =>
        !item.allDay && item.kind !== 'habit' && !['done', 'cancelled'].includes(item.status),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const conflicts = [];
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length && timed[j].startsAt < timed[i].endsAt; j += 1) {
      conflicts.push([timed[i].id, timed[j].id]);
    }
  }
  return conflicts;
}

/** Order for display: by day, all-day items first, then by start time and title. */
export function compareItems(a, b) {
  return (
    a.date.localeCompare(b.date) ||
    Number(b.allDay) - Number(a.allDay) ||
    (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
    a.title.localeCompare(b.title)
  );
}
