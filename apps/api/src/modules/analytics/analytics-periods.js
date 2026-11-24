import {
  addDays,
  addMonths,
  endOfMonth,
  minDate,
  startOfMonth,
  startOfWeek,
} from '../../core/time.js';

/**
 * Calendar periods for analytics. Everything works on calendar dates in the user's time
 * zone; a period is always a whole week, month, quarter or year, so two periods of the same
 * kind are comparable.
 */

/** The whole period of the given kind that contains `date`. */
export function periodRange(period, date, weekStart = 1) {
  switch (period) {
    case 'week': {
      const from = startOfWeek(date, weekStart);
      return { from, to: addDays(from, 6) };
    }
    case 'quarter': {
      const month = Number(date.slice(5, 7));
      const first = month - ((month - 1) % 3);
      const from = `${date.slice(0, 4)}-${String(first).padStart(2, '0')}-01`;
      return { from, to: endOfMonth(addMonths(from, 2)) };
    }
    case 'year':
      return { from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
    default:
      return { from: startOfMonth(date), to: endOfMonth(date) };
  }
}

/** The period of the same kind right before `range`. */
export function previousRange(period, range, weekStart = 1) {
  return periodRange(period, addDays(range.from, -1), weekStart);
}

/**
 * The steps a period is charted in: days for a week or a month, weeks for a quarter, months
 * for a year. Weeks are cut at the edges of the quarter, so every day belongs to one bucket.
 */
export function bucketsOf(period, range, weekStart = 1) {
  const buckets = [];
  if (period === 'week' || period === 'month') {
    for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
      buckets.push({ from: date, to: date });
    }
  } else if (period === 'quarter') {
    for (let from = range.from; from <= range.to;) {
      const to = minDate(addDays(startOfWeek(from, weekStart), 6), range.to);
      buckets.push({ from, to });
      from = addDays(to, 1);
    }
  } else {
    for (let from = range.from; from <= range.to; from = addMonths(from, 1)) {
      buckets.push({ from, to: endOfMonth(from) });
    }
  }
  return buckets;
}

/** The step size of `bucketsOf` for a period. */
export const bucketUnit = (period) =>
  period === 'quarter' ? 'week' : period === 'year' ? 'month' : 'day';
