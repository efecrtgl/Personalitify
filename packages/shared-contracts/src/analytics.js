/** Calendar periods the analytics overview can be requested for. */
export const ANALYTICS_PERIODS = Object.freeze(['week', 'month', 'quarter', 'year']);

/** Observations the analytics overview can make about a period. */
export const ANALYTICS_HIGHLIGHTS = Object.freeze([
  'habit_rate_up',
  'habit_rate_down',
  'top_habit',
  'struggling_habit',
  'best_weekday',
  'weakest_weekday',
  'tasks_on_time',
  'tasks_completed_up',
  'tasks_completed_down',
  'most_productive_day',
  'goals_completed',
  'milestones_completed',
]);

/** Where a goal stands against the share of its time that has passed. */
export const GOAL_PACES = Object.freeze(['ahead', 'on_track', 'behind']);
