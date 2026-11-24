/** What a timer session is for. */
export const FOCUS_KINDS = Object.freeze(['focus', 'short_break', 'long_break']);

/**
 * Life cycle of a timer session. `running` and `paused` are the active states; a user has at
 * most one active session at a time.
 */
export const FOCUS_STATUSES = Object.freeze(['running', 'paused', 'completed', 'cancelled']);

/** Timer lengths in minutes for a new account, and the bounds a user may choose within. */
export const FOCUS_DEFAULTS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
});
export const FOCUS_LIMITS = Object.freeze({
  minMinutes: 1,
  maxMinutes: 180,
  maxLongBreakEvery: 12,
});

/** A journal entry belongs to a day; a note does not. */
export const JOURNAL_KINDS = Object.freeze(['journal', 'note']);
export const JOURNAL_LIMITS = Object.freeze({
  titleLength: 160,
  bodyLength: 50000,
  tags: 12,
  tagLength: 32,
  revisions: 20,
});

/** Mood is recorded on a five-step scale: 1 = very bad … 5 = very good. */
export const MOOD_SCORES = Object.freeze([1, 2, 3, 4, 5]);

/** Feelings that can be attached to a mood entry. Clients translate them. */
export const MOOD_EMOTIONS = Object.freeze([
  'happy',
  'calm',
  'grateful',
  'energetic',
  'proud',
  'hopeful',
  'focused',
  'tired',
  'bored',
  'stressed',
  'anxious',
  'sad',
  'angry',
  'lonely',
]);
