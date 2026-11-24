import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { assertOwnedReferences, detachOnDelete } from '../../core/entity/references.js';
import { fieldError, limitExceeded, notFound } from '../../core/errors.js';
import { diffDays } from '../../core/time.js';
import { assertCategory } from '../categories/categories.service.js';
import { SyncEvent } from '../events/sync-event.model.js';
import { Habit } from '../habits/habit.model.js';
import { getUserCalendar, habitService } from '../habits/habits.service.js';
import { Task } from '../tasks/task.model.js';
import { Goal, MAX_MILESTONES, MAX_REVIEWS, serializeGoal } from './goal.model.js';

export const goalService = createEntityService({
  entityType: ENTITY_TYPES.GOAL,
  model: Goal,
  serialize: serializeGoal,
  maxPerUser: 300,
});

detachOnDelete({ service: goalService, field: 'categoryId', targetType: ENTITY_TYPES.CATEGORY });
detachOnDelete({ service: goalService, field: 'parentGoalId', targetType: ENTITY_TYPES.GOAL });
detachOnDelete({
  service: goalService,
  field: 'habitIds',
  targetType: ENTITY_TYPES.HABIT,
  many: true,
});

/** Sub-goals may be nested this deep below a top-level goal. */
const MAX_DEPTH = 3;

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value * 10) / 10));

/**
 * Progress of a goal as a percentage, by its progress mode.
 * A mode with nothing to measure yet (no milestones, no linked tasks) is 0%.
 */
export function goalPercent(goal, taskCounts = { total: 0, done: 0 }) {
  const { progress } = goal;
  switch (progress.mode) {
    case 'milestones': {
      const total = goal.milestones.length;
      const done = goal.milestones.filter((milestone) => milestone.done).length;
      return total === 0 ? 0 : clampPercent((done / total) * 100);
    }
    case 'tasks':
      return taskCounts.total === 0 ? 0 : clampPercent((taskCounts.done / taskCounts.total) * 100);
    case 'metric':
      return clampPercent((progress.current / progress.target) * 100);
    default:
      return clampPercent(progress.value);
  }
}

/** Linked tasks per goal: `total` leaves out cancelled tasks. */
async function countTasks(userId, goalIds) {
  const counts = new Map(goalIds.map((id) => [id, { total: 0, done: 0, open: 0 }]));
  if (goalIds.length === 0) return counts;
  const rows = await Task.aggregate([
    {
      $match: {
        userId,
        goalId: { $in: goalIds },
        deletedAt: null,
        status: { $ne: 'cancelled' },
      },
    },
    { $group: { _id: { goalId: '$goalId', status: '$status' }, count: { $sum: 1 } } },
  ]);
  for (const { _id, count } of rows) {
    const entry = counts.get(_id.goalId);
    entry.total += count;
    if (_id.status === 'done') entry.done += count;
    else entry.open += count;
  }
  return counts;
}

/** A goal together with the figures derived from it. */
function toView(goal, taskCounts, today) {
  const milestonesDone = goal.milestones.filter((milestone) => milestone.done).length;
  return {
    ...serializeGoal(goal),
    computed: {
      percent: goalPercent(goal, taskCounts),
      milestones: { total: goal.milestones.length, done: milestonesDone },
      tasks: taskCounts,
      daysLeft: goal.targetDate ? diffDays(today, goal.targetDate) : null,
      overdue:
        Boolean(goal.targetDate) &&
        goal.targetDate < today &&
        ['active', 'paused'].includes(goal.status),
    },
  };
}

async function toViews(auth, goals) {
  const [{ today }, counts] = await Promise.all([
    getUserCalendar(auth.userId),
    countTasks(
      auth.userId,
      goals.map((goal) => String(goal._id)),
    ),
  ]);
  return goals.map((goal) => toView(goal, counts.get(String(goal._id)), today));
}

const toSingleView = async (auth, goal) => (await toViews(auth, [goal]))[0];

function assertDates(goal) {
  if (goal.targetDate && goal.targetDate < goal.startDate) {
    throw fieldError('targetDate', 'end_before_start');
  }
}

/** Rejects a parent that is missing, the goal itself, one of its descendants, or too deep. */
async function assertParent(auth, goalId, parentGoalId) {
  if (!parentGoalId) return;
  if (parentGoalId === goalId) throw fieldError('parentGoalId', 'invalid_value');

  let depth = 1;
  let cursor = parentGoalId;
  while (cursor) {
    const parent = await Goal.findOne({ _id: cursor, userId: auth.userId, deletedAt: null })
      .select('parentGoalId')
      .lean();
    if (!parent) throw fieldError('parentGoalId', 'unknown_reference');
    depth += 1;
    // Walking up from the new parent must never arrive at the goal itself (a new goal has
    // no id yet and cannot be anyone's ancestor).
    if (goalId && parent.parentGoalId === goalId) {
      throw fieldError('parentGoalId', 'invalid_value');
    }
    if (depth > MAX_DEPTH) throw fieldError('parentGoalId', 'too_deep', { maximum: MAX_DEPTH });
    cursor = parent.parentGoalId;
  }
}

async function assertReferences(auth, goalId, input) {
  if (input.categoryId !== undefined) await assertCategory(auth, input.categoryId);
  if (input.habitIds !== undefined) {
    await assertOwnedReferences(auth, habitService, input.habitIds, 'habitIds');
  }
  if (input.parentGoalId !== undefined) await assertParent(auth, goalId, input.parentGoalId);
}

/** Keeps `completedAt` in step with the status. */
function syncCompletion(goal) {
  if (goal.status === 'completed') goal.completedAt ??= new Date();
  else goal.completedAt = null;
}

// --- Goals -----------------------------------------------------------------------------

export async function listGoals(auth, { status, horizon, categoryId, parentGoalId } = {}) {
  const filter = {};
  if (status === 'open') filter.status = { $in: ['active', 'paused'] };
  else if (status && status !== 'all') filter.status = status;
  if (horizon) filter.horizon = horizon;
  if (categoryId) filter.categoryId = categoryId;
  if (parentGoalId === 'none') filter.parentGoalId = null;
  else if (parentGoalId) filter.parentGoalId = parentGoalId;

  const { items } = await goalService.find(auth, filter, {
    sort: { sortOrder: 1, targetDate: 1, createdAt: 1 },
  });
  return toViews(auth, items);
}

export async function createGoal(auth, { id, ...input }) {
  await assertReferences(auth, id ?? null, input);
  const { today } = await getUserCalendar(auth.userId);
  const attributes = { ...input, startDate: input.startDate ?? today };
  assertDates(attributes);
  if (attributes.status === 'completed') attributes.completedAt = new Date();
  return toSingleView(auth, await goalService.create(auth, attributes, { id }));
}

/** A goal with its sub-goals and the habits linked to it. */
export async function getGoalDetail(auth, id) {
  const goal = await goalService.getById(auth, id);
  const [{ items: subGoals }, habits] = await Promise.all([
    goalService.find(auth, { parentGoalId: id }, { sort: { sortOrder: 1, createdAt: 1 } }),
    Habit.find({ _id: { $in: goal.habitIds }, userId: auth.userId, deletedAt: null }),
  ]);
  const [goalView, ...subGoalViews] = await toViews(auth, [goal, ...subGoals]);
  return {
    goal: goalView,
    subGoals: subGoalViews,
    habits: habits.map((habit) => ({
      id: String(habit._id),
      name: habit.name,
      color: habit.color,
      icon: habit.icon,
      archived: Boolean(habit.archivedAt),
    })),
  };
}

export async function updateGoal(auth, id, { baseVersion, ...patch }) {
  await assertReferences(auth, id, patch);
  const { document } = await goalService.mutate(
    auth,
    id,
    (goal) => {
      assignPatch(goal, patch);
      assertDates(goal);
      syncCompletion(goal);
    },
    { baseVersion, intendedFields: Object.keys(patch) },
  );
  return toSingleView(auth, document);
}

/** Deletes a goal. Its sub-goals become top-level goals and its tasks are unlinked. */
export async function deleteGoal(auth, id) {
  await goalService.remove(auth, id);
}

// --- Milestones ------------------------------------------------------------------------

function findEmbedded(list, id) {
  const item = list.find((entry) => entry.id === id);
  if (!item) throw notFound();
  return item;
}

async function mutateList(auth, goalId, field, mutator) {
  const { document } = await goalService.mutate(auth, goalId, mutator, {
    intendedFields: [field],
  });
  return toSingleView(auth, document);
}

export function addMilestone(auth, goalId, input) {
  return mutateList(auth, goalId, 'milestones', (goal) => {
    if (goal.milestones.length >= MAX_MILESTONES) {
      throw limitExceeded({ details: { limit: MAX_MILESTONES } });
    }
    goal.milestones.push(input);
  });
}

export function updateMilestone(auth, goalId, milestoneId, patch) {
  return mutateList(auth, goalId, 'milestones', (goal) => {
    const milestone = findEmbedded(goal.milestones, milestoneId);
    if (patch.title !== undefined) milestone.title = patch.title;
    if (patch.targetDate !== undefined) milestone.targetDate = patch.targetDate;
    if (patch.done !== undefined && patch.done !== milestone.done) {
      milestone.done = patch.done;
      milestone.completedAt = patch.done ? new Date() : null;
    }
  });
}

export function removeMilestone(auth, goalId, milestoneId) {
  return mutateList(auth, goalId, 'milestones', (goal) => {
    findEmbedded(goal.milestones, milestoneId);
    goal.milestones = goal.milestones.filter((milestone) => milestone.id !== milestoneId);
  });
}

// --- Reviews ---------------------------------------------------------------------------

/** Adds a review: a dated reflection that records the goal's progress at that moment. */
export async function addReview(auth, goalId, input) {
  const { today } = await getUserCalendar(auth.userId);
  const counts = await countTasks(auth.userId, [goalId]);
  return mutateList(auth, goalId, 'reviews', (goal) => {
    if (goal.reviews.length >= MAX_REVIEWS) {
      throw limitExceeded({ details: { limit: MAX_REVIEWS } });
    }
    goal.reviews.push({
      date: input.date ?? today,
      note: input.note,
      rating: input.rating ?? null,
      percent: goalPercent(goal, counts.get(goalId)),
    });
  });
}

export function removeReview(auth, goalId, reviewId) {
  return mutateList(auth, goalId, 'reviews', (goal) => {
    findEmbedded(goal.reviews, reviewId);
    goal.reviews = goal.reviews.filter((review) => review.id !== reviewId);
  });
}

// --- History ---------------------------------------------------------------------------

/** The most recent changes of a goal, newest first, from the event log. */
export async function getGoalHistory(auth, goalId) {
  await goalService.getById(auth, goalId);
  const events = await SyncEvent.find({
    userId: auth.userId,
    entityType: ENTITY_TYPES.GOAL,
    entityId: goalId,
  })
    .sort({ seq: -1 })
    .limit(50)
    .lean();
  return events.map((event) => ({
    eventId: event._id,
    event: event.type,
    version: event.entityVersion,
    at: event.occurredAt.toISOString(),
    changedFields: event.type.endsWith('.created') ? [] : event.changedFields,
    status: event.data?.status ?? null,
  }));
}
