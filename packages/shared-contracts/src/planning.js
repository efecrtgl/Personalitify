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
