/** Goals and tasks: enumerations shared by the API and every client. */

/** How far ahead a goal looks. */
export const GOAL_HORIZONS = Object.freeze(['short', 'long']);

export const GOAL_STATUSES = Object.freeze(['active', 'paused', 'completed', 'abandoned']);

/**
 * How a goal's progress is determined.
 * - `manual`      the user sets a percentage.
 * - `milestones`  share of completed milestones.
 * - `tasks`       share of completed linked tasks (cancelled tasks are left out).
 * - `metric`      `current` against `target` in a unit of the user's choice.
 */
export const GOAL_PROGRESS_MODES = Object.freeze(['manual', 'milestones', 'tasks', 'metric']);

export const TASK_PRIORITIES = Object.freeze(['none', 'low', 'medium', 'high']);

export const TASK_STATUSES = Object.freeze(['todo', 'in_progress', 'done', 'cancelled']);

/** Statuses of a task that still needs attention. */
export const OPEN_TASK_STATUSES = Object.freeze(['todo', 'in_progress']);

/**
 * What a calendar entry is.
 * - `event`  something that happens at a time: a meeting, an appointment.
 * - `block`  time the user reserves for themselves: focus time, a workout.
 */
export const CALENDAR_EVENT_KINDS = Object.freeze(['event', 'block']);

/** Where an item of the unified calendar comes from. */
export const CALENDAR_ITEM_KINDS = Object.freeze(['event', 'task', 'habit']);
