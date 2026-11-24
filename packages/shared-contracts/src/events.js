/** Version of the event envelope and payload layout. Bumped only for breaking changes. */
export const EVENT_SCHEMA_VERSION = 1;

/** The three lifecycle actions every synchronized entity emits. */
export const ENTITY_ACTIONS = Object.freeze(['created', 'updated', 'deleted']);

/**
 * Synchronized entity types. The value is the name used in event names
 * (`<entityType>.<action>`), in the synchronization API and in snapshots.
 */
export const ENTITY_TYPES = Object.freeze({
  PROFILE: 'profile',
  SETTINGS: 'settings',
  CATEGORY: 'category',
  HABIT: 'habit',
  HABIT_ENTRY: 'habitEntry',
  GOAL: 'goal',
  TASK: 'task',
  CALENDAR_EVENT: 'calendarEvent',
  FOCUS_SESSION: 'focusSession',
  JOURNAL_ENTRY: 'journalEntry',
  MOOD_ENTRY: 'moodEntry',
  ACHIEVEMENT: 'achievement',
  NOTIFICATION: 'notification',
});

/** Builds an event name such as `habit.updated`. */
export function eventName(entityType, action) {
  return `${entityType}.${action}`;
}

/** Splits an event name into its entity type and action. */
export function parseEventName(name) {
  const index = name.lastIndexOf('.');
  return { entityType: name.slice(0, index), action: name.slice(index + 1) };
}
