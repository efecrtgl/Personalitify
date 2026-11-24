import { RECURRENCE_FREQUENCIES } from '@personalitify/shared-contracts';
import { z } from 'zod';
import {
  addDays,
  dayOfMonth,
  daysInMonth,
  diffDays,
  diffMonths,
  startOfWeek,
  weekdayOf,
} from './time.js';

/**
 * Recurrence rules.
 *
 * A rule describes on which calendar dates something repeats, counted from a start date:
 *
 * ```json
 * { "frequency": "weekly", "interval": 2, "weekdays": [1, 3, 5], "monthDays": [] }
 * ```
 *
 * - `daily`    every `interval` days.
 * - `weekly`   every `interval` weeks, on `weekdays` (ISO 1–7). Empty: the start date's weekday.
 *              Weeks are counted Monday to Sunday, independent of display preferences, so a
 *              rule means the same on every device.
 * - `monthly`  every `interval` months, on `monthDays` (1–31, or -1 for the last day). Empty:
 *              the start date's day. A day that a month does not have falls on that month's
 *              last day (the 31st becomes 30 April, 28/29 February).
 * - `yearly`   every `interval` years on the start date's month and day (29 February falls
 *              on 28 February in other years).
 *
 * Rules are evaluated purely on calendar dates. Time zones and daylight saving never enter
 * here: converting an occurrence date to an instant is the caller's concern.
 */

export const recurrenceSchema = z
  .strictObject({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z.int().min(1).max(365).default(1).describe('Repeat every N days/weeks/months/years'),
    weekdays: z
      .array(z.int().min(1).max(7))
      .max(7)
      .default([])
      .describe('Weekly rules: ISO weekdays, Monday = 1 … Sunday = 7'),
    monthDays: z
      .array(z.union([z.int().min(1).max(31), z.literal(-1)]))
      .max(31)
      .default([])
      .describe('Monthly rules: days of the month; -1 means the last day'),
  })
  .describe('Recurrence rule evaluated on calendar dates');

/** Partial rule for updates: only the given fields change, nothing is defaulted. */
export const recurrencePatchSchema = z.strictObject({
  frequency: z.enum(RECURRENCE_FREQUENCIES).optional(),
  interval: z.int().min(1).max(365).optional(),
  weekdays: z.array(z.int().min(1).max(7)).max(7).optional(),
  monthDays: z
    .array(z.union([z.int().min(1).max(31), z.literal(-1)]))
    .max(31)
    .optional(),
});

/** Mongoose definition of the same structure. */
export const recurrenceFields = {
  frequency: { type: String, enum: RECURRENCE_FREQUENCIES, required: true },
  interval: { type: Number, default: 1, min: 1, max: 365 },
  weekdays: { type: [Number], default: [] },
  monthDays: { type: [Number], default: [] },
};

export function serializeRecurrence(rule) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: [...rule.weekdays].sort((a, b) => a - b),
    monthDays: [...rule.monthDays].sort((a, b) => a - b),
  };
}

function matchesMonthDay(wanted, date) {
  const day = dayOfMonth(date);
  const last = daysInMonth(date);
  // -1 is the last day; a day beyond the month's length is clamped to the last day.
  const target = wanted === -1 ? last : Math.min(wanted, last);
  return day === target;
}

/** True when `rule`, starting on `startDate`, has an occurrence on `date`. */
export function occursOn(rule, startDate, date) {
  if (date < startDate) return false;
  const interval = rule.interval ?? 1;

  switch (rule.frequency) {
    case 'daily':
      return diffDays(startDate, date) % interval === 0;

    case 'weekly': {
      const weekdays = rule.weekdays?.length ? rule.weekdays : [weekdayOf(startDate)];
      if (!weekdays.includes(weekdayOf(date))) return false;
      const weeks = diffDays(startOfWeek(startDate), startOfWeek(date)) / 7;
      return weeks % interval === 0;
    }

    case 'monthly': {
      if (diffMonths(startDate, date) % interval !== 0) return false;
      const days = rule.monthDays?.length ? rule.monthDays : [dayOfMonth(startDate)];
      return days.some((wanted) => matchesMonthDay(wanted, date));
    }

    case 'yearly': {
      const months = diffMonths(startDate, date);
      if (months % 12 !== 0 || (months / 12) % interval !== 0) return false;
      return matchesMonthDay(dayOfMonth(startDate), date);
    }

    default:
      return false;
  }
}

/**
 * Occurrence dates of `rule` between `from` and `to` (both inclusive), in ascending order.
 * `endDate` is the last date on which the rule may occur.
 */
export function occurrencesBetween(rule, startDate, from, to, { endDate, limit = 1000 } = {}) {
  const first = from > startDate ? from : startDate;
  const last = endDate && endDate < to ? endDate : to;
  const dates = [];
  for (let date = first; date <= last && dates.length < limit; date = addDays(date, 1)) {
    if (occursOn(rule, startDate, date)) dates.push(date);
  }
  return dates;
}

/** The first occurrence on or after `date`, searching at most `horizonDays` ahead. */
export function nextOccurrence(rule, startDate, date, { endDate, horizonDays = 800 } = {}) {
  const [next] = occurrencesBetween(rule, startDate, date, addDays(date, horizonDays), {
    endDate,
    limit: 1,
  });
  return next ?? null;
}

/** The last occurrence on or before `date`, searching at most `horizonDays` back. */
export function previousOccurrence(rule, startDate, date, { horizonDays = 800 } = {}) {
  const earliest = addDays(date, -horizonDays);
  for (let cursor = date; cursor >= startDate && cursor >= earliest; cursor = addDays(cursor, -1)) {
    if (occursOn(rule, startDate, cursor)) return cursor;
  }
  return null;
}
