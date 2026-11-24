import { OPEN_TASK_STATUSES, TASK_PRIORITIES } from '@personalitify/shared-contracts';
import { addDays, diffDays, startOfLocalDay, weekdayOf } from '../../core/time.js';
import { Category } from '../categories/category.model.js';
import { listGoals } from '../goals/goals.service.js';
import { computeCompletion, dayState } from '../habits/habit-schedule.js';
import { getUserCalendar, loadHabitIndexes } from '../habits/habits.service.js';
import { Task } from '../tasks/task.model.js';
import { buildHighlights } from './analytics-highlights.js';
import { bucketUnit, bucketsOf, periodRange, previousRange } from './analytics-periods.js';

/** Flexible habits are judged per week or month; their entries are read this far back. */
const PERIOD_LOOKBACK_DAYS = 31;
/** A goal is "on track" within this many percentage points of where time says it should be. */
const PACE_TOLERANCE = 10;
const MAX_GOALS = 20;
const MAX_CATEGORIES = 6;

const rateOf = (completed, due) => (due === 0 ? null : completed / due);
const within = (date, range) => date >= range.from && date <= range.to;

/**
 * Fixed-schedule habits day by day: on each day, how many were due and could be judged, and
 * how many of those were completed. A day that is still open (today, the future) and days
 * that were skipped or postponed are on neither side.
 */
function habitDays(indexes, from, to, today) {
  const fixed = indexes.filter(({ habit }) => habit.schedule.mode === 'fixed');
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    let due = 0;
    let completed = 0;
    for (const { habit, index } of fixed) {
      const day = dayState(habit, date, index, today);
      if (!day.due) continue;
      if (day.state === 'completed') {
        due += 1;
        completed += 1;
      } else if (day.state === 'missed') {
        due += 1;
      }
    }
    days.push({ date, due, completed });
  }
  return days;
}

function sumDays(days) {
  let due = 0;
  let completed = 0;
  for (const day of days) {
    due += day.due;
    completed += day.completed;
  }
  return { due, completed, missed: due - completed, rate: rateOf(completed, due) };
}

/** Each habit that was alive in the period, with its figures there and in the one before. */
function habitBreakdown(indexes, range, previous, calendar) {
  const { today, weekStart } = calendar;
  const rows = [];
  for (const { habit, index } of indexes) {
    if (habit.startDate > range.to || (habit.endDate && habit.endDate < range.from)) continue;
    const now = computeCompletion(habit, index, range.from, range.to, today, weekStart);
    const before = computeCompletion(habit, index, previous.from, previous.to, today, weekStart);
    rows.push({
      habitId: String(habit._id),
      name: habit.name,
      color: habit.color,
      icon: habit.icon,
      archived: Boolean(habit.archivedAt),
      // What `due`, `completed` and `missed` count for this habit.
      unit: habit.schedule.mode === 'flexible' ? `${habit.schedule.period}s` : 'days',
      due: now.due,
      completed: now.completed,
      missed: now.missed,
      skipped: now.skipped,
      rate: now.rate,
      previousRate: before.rate,
    });
  }
  // Most reliable first; habits without anything to judge yet go last.
  return rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name));
}

async function taskFigures(userId, range, previous, today) {
  const base = { userId, deletedAt: null };
  const [completed, due, overdueOpen] = await Promise.all([
    Task.find({ ...base, status: 'done', completedOn: { $gte: previous.from, $lte: range.to } })
      .select('completedOn dueDate priority categoryId')
      .lean(),
    Task.find({
      ...base,
      status: { $ne: 'cancelled' },
      dueDate: { $gte: range.from, $lte: range.to },
    })
      .select('dueDate status')
      .lean(),
    Task.countDocuments({
      ...base,
      status: { $in: OPEN_TASK_STATUSES },
      dueDate: { $lt: today },
    }),
  ]);

  const current = completed.filter((task) => within(task.completedOn, range));
  const before = completed.filter((task) => within(task.completedOn, previous));
  const completedByDay = new Map();
  for (const task of current) {
    completedByDay.set(task.completedOn, (completedByDay.get(task.completedOn) ?? 0) + 1);
  }

  const onTime = current.filter((task) => task.dueDate && task.completedOn <= task.dueDate).length;
  const late = current.filter((task) => task.dueDate && task.completedOn > task.dueDate).length;

  const byPriority = TASK_PRIORITIES.map((priority) => ({
    priority,
    completed: current.filter((task) => task.priority === priority).length,
  }));

  const categoryIds = [...new Set(current.map((task) => task.categoryId).filter(Boolean))];
  const categories = await Category.find({ _id: { $in: categoryIds }, userId, deletedAt: null })
    .select('name color')
    .lean();
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
  const perCategory = new Map();
  for (const task of current) {
    // A category deleted since then has no name any more; its tasks count as uncategorised.
    const category = categoryById.get(task.categoryId) ?? null;
    const key = category ? task.categoryId : null;
    const row = perCategory.get(key) ?? {
      categoryId: key,
      name: category?.name ?? null,
      color: category?.color ?? null,
      completed: 0,
    };
    row.completed += 1;
    perCategory.set(key, row);
  }
  const byCategory = [...perCategory.values()]
    .sort((a, b) => b.completed - a.completed)
    .slice(0, MAX_CATEGORIES);

  return {
    completedByDay,
    figures: {
      completed: current.length,
      due: due.length,
      dueCompleted: due.filter((task) => task.status === 'done').length,
      onTime,
      late,
      withoutDueDate: current.length - onTime - late,
      onTimeRate: rateOf(onTime, onTime + late),
      overdueOpen,
      previous: { completed: before.length },
      byPriority,
      byCategory,
    },
  };
}

/** Where a goal stands against the share of its time that has passed. */
function paceOf(goal, today) {
  if (!goal.targetDate || goal.targetDate <= goal.startDate) return { expected: null, pace: null };
  const total = diffDays(goal.startDate, goal.targetDate);
  const elapsed = Math.max(0, Math.min(total, diffDays(goal.startDate, today)));
  const expected = Math.round((elapsed / total) * 100);
  const { percent } = goal.computed;
  const pace =
    percent >= expected + PACE_TOLERANCE
      ? 'ahead'
      : percent >= expected - PACE_TOLERANCE
        ? 'on_track'
        : 'behind';
  return { expected, pace };
}

async function goalFigures(auth, range, calendar) {
  const { today, timeZone } = calendar;
  const startsAt = startOfLocalDay(range.from, timeZone).toISOString();
  const endsAt = startOfLocalDay(addDays(range.to, 1), timeZone).toISOString();
  const inPeriod = (instant) => Boolean(instant) && instant >= startsAt && instant < endsAt;

  const goals = await listGoals(auth, { status: 'all' });
  const linkedDone = await Task.aggregate([
    {
      $match: {
        userId: auth.userId,
        deletedAt: null,
        status: 'done',
        goalId: { $in: goals.map((goal) => goal.id) },
        completedOn: { $gte: range.from, $lte: range.to },
      },
    },
    { $group: { _id: '$goalId', count: { $sum: 1 } } },
  ]);
  const tasksByGoal = new Map(linkedDone.map((row) => [row._id, row.count]));

  const milestonesIn = (goal) =>
    goal.milestones.filter((milestone) => milestone.done && inPeriod(milestone.completedAt)).length;

  const active = goals.filter((goal) => goal.status === 'active');
  const items = active
    .map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      color: goal.color,
      icon: goal.icon,
      startDate: goal.startDate,
      targetDate: goal.targetDate,
      percent: goal.computed.percent,
      daysLeft: goal.computed.daysLeft,
      ...paceOf(goal, today),
      milestonesCompleted: milestonesIn(goal),
      tasksCompleted: tasksByGoal.get(goal.id) ?? 0,
    }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity))
    .slice(0, MAX_GOALS);

  return {
    active: active.length,
    completed: goals.filter((goal) => goal.status === 'completed' && inPeriod(goal.completedAt))
      .length,
    milestonesCompleted: goals.reduce((sum, goal) => sum + milestonesIn(goal), 0),
    items,
  };
}

/**
 * Statistics of one calendar period — a week, month, quarter or year — next to the period
 * before it. Every figure is counted from the user's records at request time; the
 * definitions are spelled out in the response schema and in `docs/architecture/analytics.md`.
 */
export async function getOverview(auth, { period = 'month', date } = {}) {
  const calendar = await getUserCalendar(auth.userId);
  const { today, weekStart } = calendar;
  const range = periodRange(period, date ?? today, weekStart);
  const previous = previousRange(period, range, weekStart);

  const [indexes, tasks, goals] = await Promise.all([
    loadHabitIndexes(auth, addDays(previous.from, -PERIOD_LOOKBACK_DAYS), range.to, calendar),
    taskFigures(auth.userId, range, previous, today),
    goalFigures(auth, range, calendar),
  ]);

  const allDays = habitDays(indexes, previous.from, range.to, today);
  const days = allDays
    .filter((day) => within(day.date, range))
    .map((day) => ({ ...day, tasksCompleted: tasks.completedByDay.get(day.date) ?? 0 }));
  const current = sumDays(days);
  const before = sumDays(allDays.filter((day) => within(day.date, previous)));

  const series = bucketsOf(period, range, weekStart).map((bucket) => {
    const inBucket = days.filter((day) => within(day.date, bucket));
    const { due, completed, rate } = sumDays(inBucket);
    return {
      ...bucket,
      habits: { due, completed, rate },
      tasks: { completed: inBucket.reduce((sum, day) => sum + day.tasksCompleted, 0) },
    };
  });

  const byWeekday = Array.from({ length: 7 }, (_, i) => {
    const matching = days.filter((day) => weekdayOf(day.date) === i + 1);
    const { due, completed, rate } = sumDays(matching);
    return { weekday: i + 1, due, completed, rate };
  });

  const perHabit = habitBreakdown(indexes, range, previous, calendar);
  const habits = {
    ...current,
    previous: { due: before.due, completed: before.completed, rate: before.rate },
    byWeekday,
    items: perHabit,
  };
  const complete = range.to < today;

  return {
    period,
    bucket: bucketUnit(period),
    range,
    previousRange: previous,
    today,
    timeZone: calendar.timeZone,
    weekStart,
    complete,
    series,
    habits,
    tasks: tasks.figures,
    goals,
    highlights: buildHighlights({
      period,
      complete,
      habits,
      byWeekday,
      perHabit,
      tasks: tasks.figures,
      days,
      goals,
    }),
  };
}
