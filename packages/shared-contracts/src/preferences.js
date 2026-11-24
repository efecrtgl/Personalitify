/** Allowed values of user preferences, shared by the API and every client. */

export const THEMES = Object.freeze(['system', 'light', 'dark']);

/** Order of day, month and year when a date is written with digits. */
export const DATE_FORMATS = Object.freeze(['dmy', 'mdy', 'ymd']);

export const TIME_FORMATS = Object.freeze(['24h', '12h']);

/** ISO weekday numbers a week may start on: Monday (1), Saturday (6) or Sunday (7). */
export const WEEK_STARTS = Object.freeze([1, 6, 7]);

/** ISO weekday numbers, Monday = 1 … Sunday = 7. */
export const WEEKDAYS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export const DEFAULT_TIME_ZONE = 'Europe/Istanbul';

/**
 * Widgets of the personal dashboard, in their default order. A user's layout lists them in
 * the user's own order with a visibility flag; widgets added to the product later are
 * appended to existing layouts.
 */
export const DASHBOARD_WIDGETS = Object.freeze([
  'progress',
  'quickActions',
  'habits',
  'tasks',
  'events',
  'goals',
  'week',
  'streaks',
  'insights',
  'activity',
]);
