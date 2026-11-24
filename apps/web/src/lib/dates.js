/**
 * Calendar-date helpers for presentation.
 *
 * A calendar date (`YYYY-MM-DD`) belongs to the user's time zone and is decided by the
 * server ("today" always comes from an API response). The browser only moves between dates
 * and draws them, which it does in UTC so that its own time zone can never shift a day.
 */

const DAY_MS = 86_400_000;

export function parseLocalDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toLocalDate(utcDate) {
  return utcDate.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return toLocalDate(new Date(parseLocalDate(date).getTime() + days * DAY_MS));
}

export function diffDays(from, to) {
  return Math.round((parseLocalDate(to) - parseLocalDate(from)) / DAY_MS);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function weekdayOf(date) {
  return parseLocalDate(date).getUTCDay() || 7;
}

/** First day of the week containing `date`, for a week starting on `weekStart` (1, 6 or 7). */
export function startOfWeek(date, weekStart = 1) {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

export function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}
