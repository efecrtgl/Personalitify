/** How often a recurrence rule repeats. */
export const RECURRENCE_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);

/**
 * How a habit is scheduled.
 * - `fixed`     due on the dates produced by its recurrence rule.
 * - `flexible`  a number of times per week or month, on any days.
 */
export const HABIT_SCHEDULE_MODES = Object.freeze(['fixed', 'flexible']);

export const HABIT_PERIODS = Object.freeze(['week', 'month']);

/**
 * What completing a habit means on one day.
 * - `check`     done or not done.
 * - `count`     a number of repetitions (glasses of water, pages).
 * - `duration`  a number of minutes.
 */
export const HABIT_TARGET_KINDS = Object.freeze(['check', 'count', 'duration']);

/**
 * What the user recorded for a habit on a day.
 * - `active`     progress is being tracked (`value` against `target`).
 * - `skipped`    deliberately not done; does not break a streak.
 * - `postponed`  moved to another day (`postponedTo`).
 */
export const HABIT_ENTRY_STATUSES = Object.freeze(['active', 'skipped', 'postponed']);

/**
 * The state of a habit on a day, derived by the server.
 * `pending` is a due day that can still be completed; `missed` is a past due day that was
 * not; `not_due` is a day the habit is not scheduled for.
 */
export const HABIT_DAY_STATES = Object.freeze([
  'completed',
  'partial',
  'pending',
  'missed',
  'skipped',
  'postponed',
  'not_due',
]);

/** Icons a habit, category or goal may use. Clients map these names to their own icon set. */
export const ITEM_ICONS = Object.freeze([
  'activity',
  'apple',
  'bed',
  'bike',
  'book',
  'brain',
  'briefcase',
  'brush',
  'calendar',
  'camera',
  'coffee',
  'code',
  'droplet',
  'dumbbell',
  'flame',
  'flower',
  'footprints',
  'gamepad',
  'globe',
  'graduation',
  'heart',
  'home',
  'languages',
  'leaf',
  'moon',
  'music',
  'pencil',
  'pill',
  'piggy-bank',
  'salad',
  'smile',
  'sparkles',
  'star',
  'sun',
  'target',
  'timer',
  'users',
  'wallet',
]);

/** Colors offered for habits, categories, goals and events. */
export const ITEM_COLORS = Object.freeze([
  '#0a84ff',
  '#5e5ce6',
  '#bf5af2',
  '#ff375f',
  '#ff453a',
  '#ff9f0a',
  '#ffd60a',
  '#30d158',
  '#40c8e0',
  '#8e8e93',
]);
