/**
 * The progress system: experience points (XP), levels and achievements.
 *
 * Everything here is a fixed, published rule. XP is granted by the server for things the
 * user actually recorded, exactly once per thing, and taken back when the thing is undone.
 */

/** What earns XP, and how much. */
export const XP_RULES = Object.freeze({
  /** A habit completed for a day. */
  habit_completed: 10,
  /** A task finished. */
  task_completed: 5,
  /** A high-priority task finished (instead of `task_completed`). */
  task_completed_high: 10,
  /** A milestone of a goal reached. */
  milestone_completed: 15,
  /** A goal completed. */
  goal_completed: 50,
  /** Per five full minutes of a completed focus session, up to `FOCUS_XP_CAP` a session. */
  focus_block: 2,
  /** Writing in the journal, once per calendar day. */
  journal_written: 5,
  /** Recording the mood of a day, once per day. */
  mood_recorded: 2,
});

export const FOCUS_XP_BLOCK_SECONDS = 300;
export const FOCUS_XP_CAP = 24;

/** XP a completed focus session of `elapsedSeconds` earns. */
export function focusXp(elapsedSeconds) {
  const blocks = Math.floor(elapsedSeconds / FOCUS_XP_BLOCK_SECONDS);
  return Math.min(FOCUS_XP_CAP, blocks * XP_RULES.focus_block);
}

/**
 * Total XP needed to reach `level`. Level 1 starts at 0; each level needs 100 XP more than
 * the one before: 0, 100, 300, 600, 1000, …
 */
export function xpForLevel(level) {
  return 50 * level * (level - 1);
}

/** The level a total of `xp` corresponds to. */
export function levelForXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

/** Where a total of `xp` stands between its level and the next. */
export function levelProgress(xp) {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return {
    level,
    levelXp: floor,
    nextLevelXp: ceiling,
    intoLevel: xp - floor,
    needed: ceiling - xp,
    progress: (xp - floor) / (ceiling - floor),
  };
}

export const ACHIEVEMENT_GROUPS = Object.freeze([
  'habits',
  'tasks',
  'goals',
  'focus',
  'journal',
  'mood',
  'level',
]);

/** The figures achievements are measured against. */
export const ACHIEVEMENT_METRICS = Object.freeze([
  'habitCompletions',
  'bestStreak',
  'tasksCompleted',
  'goalsCompleted',
  'milestonesCompleted',
  'focusSessions',
  'focusSeconds',
  'journalEntries',
  'moodEntries',
  'level',
]);

/**
 * Every achievement: unlocked when `metric` reaches `target`, and never taken back. Clients
 * translate the names by `key`.
 */
export const ACHIEVEMENTS = Object.freeze(
  [
    ['habit_first', 'habits', 'habitCompletions', 1],
    ['habit_100', 'habits', 'habitCompletions', 100],
    ['habit_500', 'habits', 'habitCompletions', 500],
    ['streak_7', 'habits', 'bestStreak', 7],
    ['streak_30', 'habits', 'bestStreak', 30],
    ['streak_100', 'habits', 'bestStreak', 100],
    ['task_first', 'tasks', 'tasksCompleted', 1],
    ['task_50', 'tasks', 'tasksCompleted', 50],
    ['task_250', 'tasks', 'tasksCompleted', 250],
    ['milestone_10', 'goals', 'milestonesCompleted', 10],
    ['goal_first', 'goals', 'goalsCompleted', 1],
    ['goal_5', 'goals', 'goalsCompleted', 5],
    ['focus_first', 'focus', 'focusSessions', 1],
    ['focus_10h', 'focus', 'focusSeconds', 36000],
    ['focus_50h', 'focus', 'focusSeconds', 180000],
    ['journal_first', 'journal', 'journalEntries', 1],
    ['journal_30', 'journal', 'journalEntries', 30],
    ['mood_7', 'mood', 'moodEntries', 7],
    ['mood_30', 'mood', 'moodEntries', 30],
    ['level_5', 'level', 'level', 5],
    ['level_10', 'level', 'level', 10],
  ].map(([key, group, metric, target]) => Object.freeze({ key, group, metric, target })),
);

export const ACHIEVEMENT_KEYS = Object.freeze(ACHIEVEMENTS.map((achievement) => achievement.key));
