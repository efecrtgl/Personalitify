import { DateTime, IANAZone } from 'luxon';

/**
 * Calendar-date arithmetic.
 *
 * A "local date" is a calendar day written as `YYYY-MM-DD` with no time and no zone. Whose
 * calendar it is depends on context: almost always the user's configured time zone. All
 * arithmetic on local dates is done in UTC, where every day has exactly 24 hours, so it is
 * unaffected by daylight-saving transitions. Only the conversion between an instant and a
 * local date involves a time zone.
 */

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parse(date) {
  return DateTime.fromISO(date, { zone: 'utc' });
}

export function isValidLocalDate(value) {
  return typeof value === 'string' && LOCAL_DATE.test(value) && parse(value).isValid;
}

export function isValidTimeZone(zone) {
  return typeof zone === 'string' && IANAZone.isValidZone(zone);
}

/** The calendar date it is at `instant` in `zone`. */
export function localDateInZone(instant, zone) {
  return DateTime.fromJSDate(new Date(instant), { zone }).toISODate();
}

/** The wall-clock time (`HH:mm`) it is at `instant` in `zone`. */
export function localTimeInZone(instant, zone) {
  return DateTime.fromJSDate(new Date(instant), { zone }).toFormat('HH:mm');
}

/** Today's calendar date in `zone`. */
export function todayInZone(zone, now = new Date()) {
  return localDateInZone(now, zone);
}

/**
 * The instant at which a calendar day begins in `zone`.
 * On a day whose midnight does not exist (a daylight-saving jump at 00:00), this is the first
 * instant of that day.
 */
export function startOfLocalDay(date, zone) {
  return DateTime.fromISO(date, { zone }).startOf('day').toJSDate();
}

/** The instant of a wall-clock time (`HH:mm`) on a calendar day in `zone`. */
export function instantAt(date, time, zone) {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toJSDate();
}

export function addDays(date, days) {
  return parse(date).plus({ days }).toISODate();
}

export function addMonths(date, months) {
  return parse(date).plus({ months }).toISODate();
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from, to) {
  return Math.round(parse(to).diff(parse(from), 'days').days);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function weekdayOf(date) {
  return parse(date).weekday;
}

export function dayOfMonth(date) {
  return parse(date).day;
}

export function daysInMonth(date) {
  return parse(date).daysInMonth;
}

export function startOfMonth(date) {
  return parse(date).startOf('month').toISODate();
}

export function endOfMonth(date) {
  return parse(date).endOf('month').toISODate();
}

/** Whole calendar months from the month of `from` to the month of `to`. */
export function diffMonths(from, to) {
  const a = parse(from);
  const b = parse(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/**
 * First day of the week that contains `date`.
 * @param {1|6|7} weekStart ISO weekday the week starts on.
 */
export function startOfWeek(date, weekStart = 1) {
  const offset = (weekdayOf(date) - weekStart + 7) % 7;
  return addDays(date, -offset);
}

/** Every calendar date from `from` to `to`, inclusive. */
export function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export const minDate = (a, b) => (a <= b ? a : b);
export const maxDate = (a, b) => (a >= b ? a : b);
