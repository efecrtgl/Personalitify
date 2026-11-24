/**
 * What a notification is about. A notification carries its kind and the values behind it
 * (`params`); clients phrase it in the user's language.
 */
export const NOTIFICATION_KINDS = Object.freeze([
  'habit_reminder',
  'task_due',
  'tasks_today',
  'goal_deadline',
  'event_reminder',
  'achievement_unlocked',
  'focus_completed',
]);

/**
 * The notification preference (`settings.notifications.<name>`) that switches each kind on
 * or off. Kinds without an entry follow only the main switch, `inApp`.
 */
export const NOTIFICATION_PREFERENCES = Object.freeze({
  habit_reminder: 'habitReminders',
  task_due: 'taskReminders',
  tasks_today: 'taskReminders',
  goal_deadline: 'goalReminders',
  event_reminder: 'eventReminders',
  achievement_unlocked: 'achievements',
});

/** The local time at which once-a-day notifications are made. */
export const DAILY_NOTIFICATION_TIME = '09:00';

/** A goal's deadline is announced this many days ahead, and on the day itself. */
export const GOAL_DEADLINE_DAYS = Object.freeze([3, 0]);

/** Notifications older than this are removed by the server; clients may drop them too. */
export const NOTIFICATION_RETENTION_DAYS = 60;
