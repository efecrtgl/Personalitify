import {
  ACHIEVEMENTS,
  ENTITY_TYPES,
  XP_RULES,
  eventName,
  focusXp,
  levelForXp,
  levelProgress,
} from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { registerUserCollection } from '../../core/user-data.js';
import { addDays, localDateInZone } from '../../core/time.js';
import { subscribe } from '../events/event-bus.js';
import { FocusSession } from '../focus/focus-session.model.js';
import { Goal } from '../goals/goal.model.js';
import { Habit, HabitEntry, isEntryCompleted } from '../habits/habit.model.js';
import { getHabitStats, getUserCalendar } from '../habits/habits.service.js';
import { JournalEntry } from '../journal/journal-entry.model.js';
import { MoodEntry } from '../mood/mood-entry.model.js';
import { Task } from '../tasks/task.model.js';
import {
  Achievement,
  UserProgress,
  XpGrant,
  serializeAchievement,
  serializeXpGrant,
} from './progress.model.js';

export const achievementService = createEntityService({
  entityType: ENTITY_TYPES.ACHIEVEMENT,
  model: Achievement,
  serialize: serializeAchievement,
});

registerUserCollection({ key: 'xpGrants', model: XpGrant, serialize: serializeXpGrant });
registerUserCollection({ key: 'userProgress', model: UserProgress, userField: '_id' });

const SOURCES = {
  [ENTITY_TYPES.HABIT_ENTRY]: HabitEntry,
  [ENTITY_TYPES.TASK]: Task,
  [ENTITY_TYPES.GOAL]: Goal,
  [ENTITY_TYPES.FOCUS_SESSION]: FocusSession,
  [ENTITY_TYPES.JOURNAL_ENTRY]: JournalEntry,
  [ENTITY_TYPES.MOOD_ENTRY]: MoodEntry,
};

/**
 * Records whose XP is taken back when they are undone (a task reopened, a habit day
 * cleared). Journal and mood XP is per day and stays once earned.
 */
const REVOCABLE = new Set([
  ENTITY_TYPES.HABIT_ENTRY,
  ENTITY_TYPES.TASK,
  ENTITY_TYPES.GOAL,
  ENTITY_TYPES.FOCUS_SESSION,
]);

const RECENT_GRANTS = 20;

/**
 * The XP a record is worth in its current state: the complete list of ledger rows it should
 * have. A pure function of the record, which is what makes granting repeatable.
 */
export function desiredGrants(entityType, record, timeZone) {
  const id = String(record._id);
  const localDate = (instant) => localDateInZone(instant ?? new Date(), timeZone);
  switch (entityType) {
    case ENTITY_TYPES.HABIT_ENTRY:
      return isEntryCompleted(record)
        ? [
            {
              key: `habit:${id}`,
              rule: 'habit_completed',
              amount: XP_RULES.habit_completed,
              date: record.date,
            },
          ]
        : [];
    case ENTITY_TYPES.TASK: {
      if (record.status !== 'done') return [];
      const rule = record.priority === 'high' ? 'task_completed_high' : 'task_completed';
      return [
        {
          key: `task:${id}`,
          rule,
          amount: XP_RULES[rule],
          date: record.completedOn ?? localDate(record.completedAt),
        },
      ];
    }
    case ENTITY_TYPES.GOAL: {
      const grants = record.milestones
        .filter((milestone) => milestone.done)
        .map((milestone) => ({
          key: `milestone:${id}:${milestone.id}`,
          rule: 'milestone_completed',
          amount: XP_RULES.milestone_completed,
          date: localDate(milestone.completedAt),
        }));
      if (record.status === 'completed') {
        grants.push({
          key: `goal:${id}`,
          rule: 'goal_completed',
          amount: XP_RULES.goal_completed,
          date: localDate(record.completedAt),
        });
      }
      return grants;
    }
    case ENTITY_TYPES.FOCUS_SESSION: {
      const amount =
        record.kind === 'focus' && record.status === 'completed'
          ? focusXp(record.elapsedSeconds)
          : 0;
      return amount > 0
        ? [{ key: `focus:${id}`, rule: 'focus_block', amount, date: record.date }]
        : [];
    }
    case ENTITY_TYPES.JOURNAL_ENTRY: {
      // By the day it was written, not the day it is about: backdating earns nothing extra.
      const date = localDate(record.createdAt);
      return [
        {
          key: `journal:${date}`,
          rule: 'journal_written',
          amount: XP_RULES.journal_written,
          date,
        },
      ];
    }
    case ENTITY_TYPES.MOOD_ENTRY:
      return [
        {
          key: `mood:${record.date}`,
          rule: 'mood_recorded',
          amount: XP_RULES.mood_recorded,
          date: record.date,
        },
      ];
    default:
      return [];
  }
}

/** Writes ledger rows. Safe to repeat: a row that exists keeps its day and its age. */
async function writeGrants(userId, entityType, entityId, grants) {
  if (grants.length === 0) return;
  const now = new Date();
  try {
    await XpGrant.bulkWrite(
      grants.map((grant) => ({
        updateOne: {
          filter: { userId, key: grant.key },
          update: {
            $set: { rule: grant.rule, amount: grant.amount },
            $setOnInsert: { entityType, entityId, date: grant.date, createdAt: now },
          },
          upsert: true,
          timestamps: false,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    // Two handlers inserted the same row at the same moment; the row is there either way.
    if (error?.code !== 11000 && !error?.writeErrors?.every((item) => item.code === 11000)) {
      throw error;
    }
  }
}

/** Brings the ledger rows of one record in line with the record's current state. */
async function reconcile(userId, entityType, record, timeZone) {
  const entityId = String(record._id);
  if (record.deletedAt) {
    // A cleared habit day is an undone completion. Any other deleted record keeps the XP it
    // earned: tidying up old tasks must not cost anything.
    if (entityType === ENTITY_TYPES.HABIT_ENTRY) {
      await XpGrant.deleteMany({ userId, entityType, entityId });
    }
    return;
  }
  const grants = desiredGrants(entityType, record, timeZone);
  await writeGrants(userId, entityType, entityId, grants);
  if (REVOCABLE.has(entityType)) {
    await XpGrant.deleteMany({
      userId,
      entityType,
      entityId,
      key: { $nin: grants.map((grant) => grant.key) },
    });
  }
}

async function longestStreakOf(userId, habitId) {
  try {
    const { streak } = await getHabitStats({ userId }, habitId);
    return streak.unit === 'days' ? streak.best : 0;
  } catch {
    return 0; // The habit was deleted in the meantime.
  }
}

/** The figures achievements are measured against, counted from the user's records. */
async function measure(userId) {
  const [ledger, focus, journalEntries, moodEntries, progress] = await Promise.all([
    XpGrant.aggregate([
      { $match: { userId } },
      { $group: { _id: '$rule', count: { $sum: 1 }, xp: { $sum: '$amount' } } },
    ]),
    FocusSession.aggregate([
      { $match: { userId, deletedAt: null, kind: 'focus', status: 'completed' } },
      { $group: { _id: null, count: { $sum: 1 }, seconds: { $sum: '$elapsedSeconds' } } },
    ]),
    JournalEntry.countDocuments({ userId, deletedAt: null }),
    MoodEntry.countDocuments({ userId, deletedAt: null }),
    UserProgress.findById(userId).lean(),
  ]);
  const count = (rule) => ledger.find((row) => row._id === rule)?.count ?? 0;
  const totalXp = ledger.reduce((sum, row) => sum + row.xp, 0);
  return {
    totalXp,
    metrics: {
      habitCompletions: count('habit_completed'),
      bestStreak: progress?.bestStreak ?? 0,
      tasksCompleted: count('task_completed') + count('task_completed_high'),
      goalsCompleted: count('goal_completed'),
      milestonesCompleted: count('milestone_completed'),
      focusSessions: focus[0]?.count ?? 0,
      focusSeconds: focus[0]?.seconds ?? 0,
      journalEntries,
      moodEntries,
      level: levelForXp(totalXp),
    },
  };
}

/** Unlocks every achievement whose target has been reached. Returns the new ones. */
async function unlockReached(userId) {
  const [{ metrics }, unlocked] = await Promise.all([
    measure(userId),
    Achievement.find({ userId, deletedAt: null }).select('key').lean(),
  ]);
  const have = new Set(unlocked.map((achievement) => achievement.key));
  const reached = ACHIEVEMENTS.filter(
    (achievement) =>
      !have.has(achievement.key) && metrics[achievement.metric] >= achievement.target,
  );
  const created = [];
  for (const { key } of reached) {
    try {
      created.push(
        await achievementService.create(
          { userId, deviceId: null },
          { key, unlockedAt: new Date() },
        ),
      );
    } catch (error) {
      if (error?.code !== 11000) throw error; // Unlocked by a concurrent handler.
    }
  }
  return created;
}

/** Grants XP for everything the account recorded before it first used the progress system. */
async function backfill(userId) {
  const { timeZone } = await getUserCalendar(userId);
  for (const [entityType, model] of Object.entries(SOURCES)) {
    for await (const record of model.find({ userId, deletedAt: null }).cursor()) {
      await writeGrants(
        userId,
        entityType,
        String(record._id),
        desiredGrants(entityType, record, timeZone),
      );
    }
  }
  let bestStreak = 0;
  const habits = await Habit.find({ userId, deletedAt: null }).select('_id').lean();
  for (const habit of habits) {
    bestStreak = Math.max(bestStreak, await longestStreakOf(userId, String(habit._id)));
  }
  await UserProgress.updateOne(
    { _id: userId },
    { $max: { bestStreak }, $set: { backfilledAt: new Date() } },
  );
  await unlockReached(userId);
}

/** Makes sure the account's bookkeeping exists and earlier records have been counted. */
async function ensureProgress(userId) {
  let progress = await UserProgress.findById(userId).lean();
  if (!progress) {
    try {
      await UserProgress.create({ _id: userId });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
    progress = await UserProgress.findById(userId).lean();
  }
  if (!progress.backfilledAt) await backfill(userId);
}

/**
 * Reacts to a change of a record that can earn XP: brings its ledger rows up to date and
 * unlocks what has been reached. Idempotent, as the event bus requires.
 */
export async function handleProgressEvent(event) {
  const { userId, entityType, entityId } = event;
  const model = SOURCES[entityType];
  if (!model) return;
  await ensureProgress(userId);
  const record = await model.findOne({ _id: entityId, userId });
  if (!record) return;

  const { timeZone } = await getUserCalendar(userId);
  await reconcile(userId, entityType, record, timeZone);
  if (entityType === ENTITY_TYPES.HABIT_ENTRY && !record.deletedAt) {
    const best = await longestStreakOf(userId, record.habitId);
    if (best > 0) await UserProgress.updateOne({ _id: userId }, { $max: { bestStreak: best } });
  }
  await unlockReached(userId);
}

subscribe('achievements.progress', handleProgressEvent, {
  types: [
    ...[
      ENTITY_TYPES.HABIT_ENTRY,
      ENTITY_TYPES.TASK,
      ENTITY_TYPES.GOAL,
      ENTITY_TYPES.FOCUS_SESSION,
    ].flatMap((type) => [eventName(type, 'created'), eventName(type, 'updated')]),
    eventName(ENTITY_TYPES.HABIT_ENTRY, 'deleted'),
    eventName(ENTITY_TYPES.JOURNAL_ENTRY, 'created'),
    eventName(ENTITY_TYPES.MOOD_ENTRY, 'created'),
  ],
});

/** XP, level, every achievement with how far along it is, and the latest XP earned. */
export async function getProgress(auth) {
  const { userId } = auth;
  await ensureProgress(userId);
  const [{ today }, { totalXp, metrics }, unlocked, recent] = await Promise.all([
    getUserCalendar(userId),
    measure(userId),
    Achievement.find({ userId, deletedAt: null }),
    XpGrant.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(RECENT_GRANTS),
  ]);
  const since = await XpGrant.aggregate([
    { $match: { userId, date: { $gte: addDays(today, -6), $lte: today } } },
    { $group: { _id: '$date', xp: { $sum: '$amount' } } },
  ]);
  const xpOn = new Map(since.map((row) => [row._id, row.xp]));
  const unlockedAt = new Map(
    unlocked.map((achievement) => [achievement.key, achievement.unlockedAt.toISOString()]),
  );

  return {
    today,
    xp: {
      total: totalXp,
      today: xpOn.get(today) ?? 0,
      week: since.reduce((sum, row) => sum + row.xp, 0),
    },
    level: levelProgress(totalXp),
    achievements: ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      // Reached once is reached for good, even if the figure has fallen since.
      current: unlockedAt.has(achievement.key)
        ? achievement.target
        : Math.min(metrics[achievement.metric], achievement.target),
      unlocked: unlockedAt.has(achievement.key),
      unlockedAt: unlockedAt.get(achievement.key) ?? null,
    })),
    recent: recent.map(serializeXpGrant),
  };
}
