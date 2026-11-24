import { OPEN_TASK_STATUSES } from '@personalitify/shared-contracts';
import { addDays } from '../../core/time.js';
import { getCalendar } from '../calendar/calendar.service.js';
import { SyncEvent } from '../events/sync-event.model.js';
import { listGoals } from '../goals/goals.service.js';
import { Habit } from '../habits/habit.model.js';
import { getDay, getHabitTotalsByDay, getUserCalendar } from '../habits/habits.service.js';
import { Task } from '../tasks/task.model.js';
import { getTaskDay } from '../tasks/tasks.service.js';
import { buildInsights, summarizeDays } from './dashboard-insights.js';

const LIST_LIMIT = 6;
const ACTIVITY_LIMIT = 8;

/** Tasks completed per calendar day of a range. */
async function completedTasksByDay(userId, from, to) {
  const rows = await Task.aggregate([
    { $match: { userId, deletedAt: null, completedOn: { $gte: from, $lte: to } } },
    { $group: { _id: '$completedOn', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/**
 * What the user did recently, taken from the event log. Only changes that read as an
 * activity are listed; bookkeeping events (settings, reordering, edits) are left out.
 */
async function recentActivity(userId) {
  const events = await SyncEvent.find({
    userId,
    type: {
      $in: [
        'habitEntry.created',
        'habitEntry.updated',
        'task.created',
        'task.updated',
        'goal.created',
        'goal.updated',
        'habit.created',
        'calendarEvent.created',
      ],
    },
  })
    .sort({ seq: -1 })
    .limit(80)
    .lean();

  const habitIds = [...new Set(events.map((event) => event.data?.habitId).filter(Boolean))];
  const habits = await Habit.find({ _id: { $in: habitIds }, userId })
    .select('name')
    .lean();
  const habitNames = new Map(habits.map((habit) => [String(habit._id), habit.name]));

  const activity = [];
  for (const event of events) {
    const { data, changedFields } = event;
    let kind = null;
    let title = data?.title ?? data?.name ?? null;
    switch (event.type) {
      case 'habitEntry.created':
      case 'habitEntry.updated':
        if (data.completed && (event.type.endsWith('created') || changedFields.includes('value'))) {
          kind = 'habit_completed';
          title = habitNames.get(data.habitId) ?? null;
        }
        break;
      case 'task.created':
        kind = data.status === 'done' ? 'task_completed' : 'task_created';
        break;
      case 'task.updated':
        if (changedFields.includes('status') && data.status === 'done') kind = 'task_completed';
        break;
      case 'goal.created':
        kind = 'goal_created';
        break;
      case 'goal.updated':
        if (changedFields.includes('status') && data.status === 'completed') {
          kind = 'goal_completed';
        }
        break;
      case 'habit.created':
        kind = 'habit_created';
        break;
      case 'calendarEvent.created':
        kind = 'event_created';
        break;
      default:
    }
    if (!kind || !title) continue;
    activity.push({
      id: event._id,
      kind,
      title,
      entityType: event.entityType,
      entityId: event.type.startsWith('habitEntry') ? data.habitId : event.entityId,
      at: event.occurredAt.toISOString(),
    });
    if (activity.length === ACTIVITY_LIMIT) break;
  }
  return activity;
}

/**
 * Everything the personal dashboard shows, in one request. Every figure is derived from the
 * user's own records at the time of the request; nothing is estimated or stored separately.
 */
export async function getDashboard(auth) {
  const calendar = await getUserCalendar(auth.userId);
  const { today } = calendar;
  const previousFrom = addDays(today, -13);

  const [habitDay, taskDay, upcomingCalendar, goals, habitTotals, tasksDone, activity, openTasks] =
    await Promise.all([
      getDay(auth, today),
      getTaskDay(auth, today),
      getCalendar(auth, { from: today, to: addDays(today, 7), include: ['event', 'task'] }),
      listGoals(auth, { status: 'active', parentGoalId: 'none' }),
      getHabitTotalsByDay(auth, previousFrom, today, calendar),
      completedTasksByDay(auth.userId, previousFrom, today),
      recentActivity(auth.userId),
      Task.countDocuments({
        userId: auth.userId,
        deletedAt: null,
        status: { $in: OPEN_TASK_STATUSES },
      }),
    ]);

  const days = habitTotals.map((day) => ({ ...day, tasksCompleted: tasksDone.get(day.date) ?? 0 }));
  const lastWeek = days.slice(0, 7);
  const thisWeek = days.slice(7);
  const current = summarizeDays(thisWeek);
  const previous = summarizeDays(lastWeek);

  // Upcoming: what is still ahead today, then the following days.
  const now = new Date().toISOString();
  const upcoming = upcomingCalendar.items
    .filter((item) => (item.allDay ? item.endDate >= today : item.endsAt > now))
    .filter((item) => !['done', 'cancelled'].includes(item.status))
    .slice(0, LIST_LIMIT);

  const streaks = habitDay.items
    .filter((item) => item.streak.current > 0)
    .sort((a, b) => b.streak.current - a.streak.current)
    .slice(0, 5)
    .map((item) => ({
      habitId: item.habitId,
      name: item.habit.name,
      color: item.habit.color,
      icon: item.habit.icon,
      current: item.streak.current,
      best: item.streak.best,
      unit: item.streak.unit,
    }));

  const sortedGoals = [...goals].sort(
    (a, b) => (a.computed.daysLeft ?? Infinity) - (b.computed.daysLeft ?? Infinity),
  );

  return {
    today,
    timeZone: calendar.timeZone,
    habits: { summary: habitDay.summary, items: habitDay.items },
    tasks: {
      summary: { ...taskDay.summary, open: openTasks },
      overdue: taskDay.overdue.slice(0, LIST_LIMIT),
      due: taskDay.due.slice(0, LIST_LIMIT),
      completed: taskDay.completed.slice(0, LIST_LIMIT),
    },
    upcoming,
    goals: sortedGoals.slice(0, LIST_LIMIT),
    week: {
      days: thisWeek,
      habits: {
        due: current.due,
        completed: current.completed,
        rate: current.rate,
        previousRate: previous.rate,
      },
      tasksCompleted: thisWeek.reduce((sum, day) => sum + day.tasksCompleted, 0),
      previousTasksCompleted: lastWeek.reduce((sum, day) => sum + day.tasksCompleted, 0),
    },
    streaks,
    activity,
    insights: buildInsights({
      thisWeek,
      lastWeek,
      habitItems: habitDay.items,
      overdueTasks: taskDay.summary.overdue,
      goals: sortedGoals,
      upcoming: upcomingCalendar.items,
      today,
    }),
  };
}
