import { occursOn } from '../../core/recurrence.js';
import {
  addDays,
  eachDate,
  endOfMonth,
  maxDate,
  minDate,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from '../../core/time.js';
import { isEntryCompleted } from './habit.model.js';

/**
 * Pure scheduling rules of habits. Everything here works on calendar dates in the user's
 * time zone and on plain entry records; nothing touches the database or the clock, which is
 * what makes the rules testable day by day.
 */

/** How far back streaks are followed. */
export const STREAK_HORIZON_DAYS = 1100;

export function isWithinLifetime(habit, date) {
  return date >= habit.startDate && (!habit.endDate || date <= habit.endDate);
}

/** True when a fixed-schedule habit is scheduled on `date` by its own rule. */
export function isScheduledOn(habit, date) {
  if (habit.schedule.mode !== 'fixed' || !isWithinLifetime(habit, date)) return false;
  return occursOn(habit.schedule.recurrence, habit.startDate, date);
}

/**
 * Indexes the entries of one habit for day-by-day evaluation.
 * @returns {{ byDate: Map<string, object>, postponedTo: Map<string, object[]> }}
 */
export function indexEntries(entries) {
  const byDate = new Map();
  const postponedTo = new Map();
  for (const entry of entries) {
    byDate.set(entry.date, entry);
    if (entry.status === 'postponed' && entry.postponedTo) {
      const list = postponedTo.get(entry.postponedTo) ?? [];
      list.push(entry);
      postponedTo.set(entry.postponedTo, list);
    }
  }
  return { byDate, postponedTo };
}

/**
 * The state of a habit on one day.
 *
 * - A fixed habit is **due** when its rule schedules the day or an earlier occurrence was
 *   postponed to it.
 * - A flexible habit is never due on a particular day; its obligation is per period.
 * - `skipped` and `postponed` are deliberate and never count as missed.
 * - A due day in the past that was not completed is `missed`; today and future days are
 *   `pending` (or `partial` once progress exists).
 */
export function dayState(habit, date, index, today) {
  const entry = index.byDate.get(date) ?? null;
  const moved = index.postponedTo.has(date);
  const due = isWithinLifetime(habit, date) && (isScheduledOn(habit, date) || moved);

  if (entry?.status === 'skipped') return { state: 'skipped', due, entry };
  if (entry?.status === 'postponed') return { state: 'postponed', due, entry };
  if (entry && isEntryCompleted(entry)) return { state: 'completed', due, entry };
  if (!due) return { state: 'not_due', due, entry };
  if (date < today) return { state: 'missed', due, entry };
  return { state: entry && entry.value > 0 ? 'partial' : 'pending', due, entry };
}

/** The week or month that contains `date`. */
export function periodOf(habit, date, weekStart) {
  if (habit.schedule.period === 'month') {
    return { from: startOfMonth(date), to: endOfMonth(date) };
  }
  const from = startOfWeek(date, weekStart);
  return { from, to: addDays(from, 6) };
}

function previousPeriod(habit, period, weekStart) {
  return periodOf(habit, addDays(period.from, -1), weekStart);
}

/** Days with a completed entry inside a period. */
export function completedDaysIn(period, index) {
  let count = 0;
  for (const [date, entry] of index.byDate) {
    if (date >= period.from && date <= period.to && isEntryCompleted(entry)) count += 1;
  }
  return count;
}

/** Progress of a flexible habit in the period that contains `date`. */
export function periodProgress(habit, date, index, weekStart) {
  const period = periodOf(habit, date, weekStart);
  const completed = completedDaysIn(period, index);
  const target = habit.schedule.timesPerPeriod;
  return { ...period, completed, target, met: completed >= target };
}

/**
 * Streaks of a fixed-schedule habit, counted in due days.
 * Skipped, postponed and not-due days are neutral. A day that is still pending (today) does
 * not break the current streak; a missed day does.
 */
function fixedStreaks(habit, index, today) {
  const start = maxDate(habit.startDate, addDays(today, -STREAK_HORIZON_DAYS));
  const end = habit.endDate ? minDate(habit.endDate, today) : today;
  if (end < start) return { current: 0, best: 0, unit: 'days' };

  let best = 0;
  let run = 0;
  for (const date of eachDate(start, end)) {
    const { state } = dayState(habit, date, index, today);
    if (state === 'completed') {
      run += 1;
      best = Math.max(best, run);
    } else if (state === 'missed') {
      run = 0;
    }
  }
  // `run` is the streak that reaches the last evaluated day: the current one.
  return { current: run, best, unit: 'days' };
}

/**
 * Streaks of a flexible habit, counted in periods that met their quota.
 * The current period does not break the streak while it can still be completed.
 */
function flexibleStreaks(habit, index, today, weekStart) {
  const unit = habit.schedule.period === 'month' ? 'months' : 'weeks';
  const earliest = maxDate(habit.startDate, addDays(today, -STREAK_HORIZON_DAYS));
  const lastDay = habit.endDate ? minDate(habit.endDate, today) : today;
  if (lastDay < earliest) return { current: 0, best: 0, unit };

  // Collect periods from the newest to the oldest, then evaluate oldest first.
  const periods = [];
  for (
    let period = periodOf(habit, lastDay, weekStart);
    period.to >= earliest;
    period = previousPeriod(habit, period, weekStart)
  ) {
    periods.push(period);
  }
  periods.reverse();

  const target = habit.schedule.timesPerPeriod;
  let best = 0;
  let run = 0;
  for (const period of periods) {
    const met = completedDaysIn(period, index) >= target;
    const stillOpen = period.to >= today && (!habit.endDate || habit.endDate >= today);
    if (met) {
      run += 1;
      best = Math.max(best, run);
    } else if (!stillOpen) {
      run = 0;
    }
  }
  return { current: run, best, unit };
}

export function computeStreaks(habit, index, today, weekStart = 1) {
  return habit.schedule.mode === 'flexible'
    ? flexibleStreaks(habit, index, today, weekStart)
    : fixedStreaks(habit, index, today);
}

/**
 * Completion figures of a habit between two dates (inclusive).
 *
 * `rate` is completed due days divided by due days that could be judged: skipped and
 * postponed days are left out of both sides, and so is a today that is still open. For a
 * flexible habit the unit is periods instead of days.
 */
export function computeCompletion(habit, index, from, to, today, weekStart = 1) {
  const first = maxDate(from, habit.startDate);
  const last = minDate(minDate(to, today), habit.endDate ?? to);
  const summary = { due: 0, completed: 0, missed: 0, skipped: 0, postponed: 0, extra: 0 };
  const byWeekday = Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, due: 0, completed: 0 }));
  if (last < first) return { ...summary, rate: null, byWeekday };

  if (habit.schedule.mode === 'flexible') {
    for (let period = periodOf(habit, first, weekStart); period.from <= last;) {
      const done = completedDaysIn(period, index);
      const open = period.to >= today;
      if (done >= habit.schedule.timesPerPeriod) {
        summary.due += 1;
        summary.completed += 1;
      } else if (!open) {
        summary.due += 1;
        summary.missed += 1;
      }
      period = periodOf(habit, addDays(period.to, 1), weekStart);
    }
    for (const date of eachDate(first, last)) {
      const entry = index.byDate.get(date);
      if (entry && isEntryCompleted(entry)) byWeekday[weekdayOf(date) - 1].completed += 1;
    }
  } else {
    for (const date of eachDate(first, last)) {
      const { state, due } = dayState(habit, date, index, today);
      const weekday = byWeekday[weekdayOf(date) - 1];
      if (state === 'skipped') summary.skipped += 1;
      else if (state === 'postponed') summary.postponed += 1;
      else if (state === 'completed' && !due) summary.extra += 1;
      else if (state === 'completed') {
        summary.due += 1;
        summary.completed += 1;
        weekday.due += 1;
        weekday.completed += 1;
      } else if (state === 'missed') {
        summary.due += 1;
        summary.missed += 1;
        weekday.due += 1;
      }
    }
  }

  return {
    ...summary,
    rate: summary.due === 0 ? null : summary.completed / summary.due,
    byWeekday,
  };
}
