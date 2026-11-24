import { addDays, eachDate, startOfWeek } from '../lib/dates.js';

/**
 * Pure layout calculations of the calendar. Items arrive from the API already positioned in
 * the user's time zone (`date`, `startTime`, `endDate`, `endTime`); nothing here touches time
 * zones.
 */

export const MINUTES_PER_DAY = 24 * 60;

export const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function toTime(minutes) {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutes));
  const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
  return `${hours}:${String(clamped % 60).padStart(2, '0')}`;
}

/** The seven dates of the week that contains `date`. */
export function weekDates(date, weekStart) {
  const first = startOfWeek(date, weekStart);
  return eachDate(first, addDays(first, 6));
}

/**
 * The weeks shown for the month of `date`: whole weeks from the one containing the 1st to
 * the one containing the last day.
 */
export function monthWeeks(date, weekStart) {
  const firstOfMonth = `${date.slice(0, 8)}01`;
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastOfMonth = `${date.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;

  const weeks = [];
  for (
    let cursor = startOfWeek(firstOfMonth, weekStart);
    cursor <= lastOfMonth;
    cursor = addDays(cursor, 7)
  ) {
    weeks.push(eachDate(cursor, addDays(cursor, 6)));
  }
  return weeks;
}

/** The first and last date a view needs data for. */
export function viewRange(view, date, weekStart) {
  if (view === 'day') return { from: date, to: date };
  if (view === 'week') {
    const dates = weekDates(date, weekStart);
    return { from: dates[0], to: dates[6] };
  }
  const weeks = monthWeeks(date, weekStart);
  return { from: weeks[0][0], to: weeks.at(-1)[6] };
}

/** The anchor date one step before or after, for the previous/next buttons. */
export function shiftAnchor(view, date, direction) {
  if (view === 'day') return addDays(date, direction);
  if (view === 'week') return addDays(date, 7 * direction);
  const [year, month] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1 + direction, 1));
  return moved.toISOString().slice(0, 10);
}

/** Whether an item is shown in the all-day area of `date`. */
const coversAllDay = (item, date) => item.allDay && item.date <= date && item.endDate >= date;

/** Whether a timed item occupies some part of `date`. */
function coversTimed(item, date) {
  if (item.allDay || item.date > date || item.endDate < date) return false;
  // An item that ends exactly at midnight does not occupy the next day.
  return !(item.endDate === date && item.date < date && item.endTime === '00:00');
}

/** Items of one day, split into the all-day area and the time grid. */
export function itemsOfDay(items, date) {
  return {
    allDay: items.filter((item) => coversAllDay(item, date)),
    timed: items.filter((item) => coversTimed(item, date)),
  };
}

/** Everything that touches `date`, all-day items first; used by the month view. */
export function itemsTouching(items, date) {
  const { allDay, timed } = itemsOfDay(items, date);
  return [...allDay, ...timed];
}

/**
 * Positions the timed items of one day.
 *
 * Returns, for each item, where it starts and how long it is within that day (in minutes),
 * and which of how many side-by-side columns it occupies. Overlapping items share the width;
 * a group of items that do not overlap anything else keeps the full width.
 */
export function layoutTimed(items, date, minimumMinutes = 20) {
  const blocks = items
    .map((item) => {
      const start = item.date < date ? 0 : toMinutes(item.startTime);
      const end = item.endDate > date ? MINUTES_PER_DAY : toMinutes(item.endTime);
      return { item, start, end: Math.max(end, start + minimumMinutes) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const columns = Math.max(0, ...cluster.map((block) => block.column)) + 1;
    for (const block of cluster) placed.push({ ...block, columns });
    cluster = [];
  };

  for (const block of blocks) {
    if (cluster.length > 0 && block.start >= clusterEnd) closeCluster();
    // The first column whose last block has already ended.
    const taken = new Map();
    for (const other of cluster) {
      taken.set(other.column, Math.max(taken.get(other.column) ?? 0, other.end));
    }
    let column = 0;
    while ((taken.get(column) ?? 0) > block.start) column += 1;
    cluster.push({ ...block, column });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  if (cluster.length > 0) closeCluster();
  return placed;
}

/** Rounds minutes to the nearest step, for snapping a drop position. */
export const snapMinutes = (minutes, step = 15) => Math.round(minutes / step) * step;
