import {
  DAILY_NOTIFICATION_TIME,
  ENTITY_TYPES,
  GOAL_DEADLINE_DAYS,
  OPEN_TASK_STATUSES,
} from '@personalitify/shared-contracts';
import { logger } from '../../core/logger.js';
import { addDays, diffDays, instantAt, localDateInZone, startOfLocalDay } from '../../core/time.js';
import { CalendarEvent } from '../calendar/calendar-event.model.js';
import { expandEvent } from '../calendar/calendar-items.js';
import { Goal } from '../goals/goal.model.js';
import { dayState, isWithinLifetime, periodProgress } from '../habits/habit-schedule.js';
import { isEntryCompleted } from '../habits/habit.model.js';
import { loadHabitIndexes } from '../habits/habits.service.js';
import { Settings } from '../settings/settings.model.js';
import { Task } from '../tasks/task.model.js';
import { notify } from './notifications.service.js';

/** After downtime, reminders that fell due at most this long ago are still sent. */
const MAX_CATCH_UP_MS = 15 * 60_000;
/** The first run of a fresh installation looks back this far. */
const FIRST_RUN_LOOKBACK_MS = 60_000;

/**
 * Everything one user should be reminded of in the window `(from, to]`.
 *
 * Reminders are found by asking, for each thing that can remind, at which instant it would
 * do so, and keeping those whose instant lies in the window. Each has a `dedupeKey` that
 * names the occasion, so overlapping windows cannot remind twice.
 *
 * @param {string} userId
 * @param {{ timeZone?: string, weekStart?: number, notifications?: object }} preferences
 * @param {{ from: Date, to: Date }} window
 */
export async function collectReminders(userId, preferences, { from, to }) {
  const timeZone = preferences.timeZone ?? 'UTC';
  const weekStart = preferences.weekStart ?? 1;
  const wants = (name) => preferences.notifications?.[name] !== false;
  const inWindow = (instant) => instant > from && instant <= to;
  const today = localDateInZone(to, timeZone);
  // A window that crosses midnight touches two calendar days.
  const dates = [...new Set([localDateInZone(from, timeZone), today])];
  const reminders = [];

  if (wants('habitReminders')) {
    const calendar = { timeZone, today, weekStart };
    const indexes = await loadHabitIndexes({ userId }, addDays(today, -31), today, calendar, {
      archivedAt: null,
      'reminders.0': { $exists: true },
    });
    for (const { habit, index } of indexes) {
      for (const date of dates) {
        for (const reminder of habit.reminders) {
          if (!reminder.enabled || !inWindow(instantAt(date, reminder.time, timeZone))) continue;
          // Remind only while there is something left to do.
          let open;
          if (habit.schedule.mode === 'flexible') {
            const doneToday = index.byDate.get(date);
            open =
              isWithinLifetime(habit, date) &&
              !(doneToday && isEntryCompleted(doneToday)) &&
              !periodProgress(habit, date, index, weekStart).met;
          } else {
            const { due, state } = dayState(habit, date, index, today);
            open = due && (state === 'pending' || state === 'partial');
          }
          if (!open) continue;
          reminders.push({
            kind: 'habit_reminder',
            params: { name: habit.name, time: reminder.time },
            entityType: ENTITY_TYPES.HABIT,
            entityId: String(habit._id),
            dedupeKey: `habit:${habit._id}:${date}:${reminder.time}`,
          });
        }
      }
    }
  }

  if (wants('taskReminders')) {
    const open = { userId, deletedAt: null, status: { $in: OPEN_TASK_STATUSES } };
    const timed = await Task.find({ ...open, dueDate: { $in: dates }, dueTime: { $ne: null } })
      .select('title dueDate dueTime')
      .lean();
    for (const task of timed) {
      if (!inWindow(instantAt(task.dueDate, task.dueTime, timeZone))) continue;
      reminders.push({
        kind: 'task_due',
        params: { title: task.title, time: task.dueTime },
        entityType: ENTITY_TYPES.TASK,
        entityId: String(task._id),
        dedupeKey: `task:${task._id}:${task.dueDate}:${task.dueTime}`,
      });
    }
    // Once a day: what is due today and what is still open from before.
    for (const date of dates) {
      if (!inWindow(instantAt(date, DAILY_NOTIFICATION_TIME, timeZone))) continue;
      const [due, overdue] = await Promise.all([
        Task.countDocuments({ ...open, dueDate: date }),
        Task.countDocuments({ ...open, dueDate: { $lt: date } }),
      ]);
      if (due + overdue === 0) continue;
      reminders.push({
        kind: 'tasks_today',
        params: { due, overdue, date },
        dedupeKey: `tasks_today:${date}`,
      });
    }
  }

  if (wants('goalReminders')) {
    for (const date of dates) {
      if (!inWindow(instantAt(date, DAILY_NOTIFICATION_TIME, timeZone))) continue;
      const goals = await Goal.find({
        userId,
        deletedAt: null,
        status: 'active',
        targetDate: { $in: GOAL_DEADLINE_DAYS.map((days) => addDays(date, days)) },
      })
        .select('title targetDate')
        .lean();
      for (const goal of goals) {
        const days = diffDays(date, goal.targetDate);
        reminders.push({
          kind: 'goal_deadline',
          params: { title: goal.title, days, date: goal.targetDate },
          entityType: ENTITY_TYPES.GOAL,
          entityId: String(goal._id),
          dedupeKey: `goal:${goal._id}:${goal.targetDate}:${days}`,
        });
      }
    }
  }

  if (wants('eventReminders')) {
    const events = await CalendarEvent.find({
      userId,
      deletedAt: null,
      'reminderMinutes.0': { $exists: true },
    });
    for (const event of events) {
      // A reminder can be set up to days ahead: look as far as the longest one reaches.
      const reach = Math.ceil(Math.max(...event.reminderMinutes) / 1440) + 1;
      const occurrences = expandEvent(event, addDays(today, -1), addDays(today, reach), timeZone);
      for (const occurrence of occurrences) {
        const startsAt = occurrence.startsAt
          ? new Date(occurrence.startsAt)
          : startOfLocalDay(occurrence.date, timeZone);
        for (const minutes of event.reminderMinutes) {
          if (!inWindow(new Date(startsAt.getTime() - minutes * 60_000))) continue;
          reminders.push({
            kind: 'event_reminder',
            params: {
              title: event.title,
              minutes,
              date: occurrence.date,
              time: occurrence.startTime,
              allDay: occurrence.allDay,
            },
            entityType: ENTITY_TYPES.CALENDAR_EVENT,
            entityId: String(event._id),
            dedupeKey: `event:${event._id}:${occurrence.occurrenceDate}:${minutes}`,
          });
        }
      }
    }
  }

  return reminders;
}

/**
 * The reminder job: sends what fell due since the previous run, for every user who has
 * notifications switched on. One user's failure does not stop the others.
 */
export async function runReminders({ now = new Date(), previousRunAt = null } = {}) {
  const earliest = new Date(now.getTime() - MAX_CATCH_UP_MS);
  const from = previousRunAt
    ? new Date(Math.max(previousRunAt.getTime(), earliest.getTime()))
    : new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);

  let users = 0;
  let sent = 0;
  const cursor = Settings.find({ 'notifications.inApp': { $ne: false } })
    .select('userId timeZone weekStart notifications')
    .lean()
    .cursor();
  for await (const preferences of cursor) {
    users += 1;
    try {
      const reminders = await collectReminders(preferences.userId, preferences, { from, to: now });
      for (const reminder of reminders) {
        if (await notify(preferences.userId, reminder)) sent += 1;
      }
    } catch (error) {
      logger.error({ err: error, userId: preferences.userId }, 'Reminders failed for user');
    }
  }
  return { users, sent };
}
