import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { detachOnDelete } from '../../core/entity/references.js';
import { fieldError, notFound } from '../../core/errors.js';
import { addDays, diffDays, maxDate, todayInZone } from '../../core/time.js';
import { assertCategory } from '../categories/categories.service.js';
import { getUserPreferences } from '../settings/settings.service.js';
import {
  STREAK_HORIZON_DAYS,
  computeCompletion,
  computeStreaks,
  dayState,
  indexEntries,
  isWithinLifetime,
  periodProgress,
} from './habit-schedule.js';
import { Habit, HabitEntry, serializeHabit, serializeHabitEntry } from './habit.model.js';

export const habitService = createEntityService({
  entityType: ENTITY_TYPES.HABIT,
  model: Habit,
  serialize: serializeHabit,
  maxPerUser: 200,
});

export const habitEntryService = createEntityService({
  entityType: ENTITY_TYPES.HABIT_ENTRY,
  model: HabitEntry,
  serialize: serializeHabitEntry,
});

/** Longest range a history or overview request may cover. */
export const MAX_RANGE_DAYS = 400;
/** How far an occurrence may be postponed. */
const MAX_POSTPONE_DAYS = 31;

/** The user's calendar: today's date and week start in their configured time zone. */
export async function getUserCalendar(userId) {
  const preferences = await getUserPreferences(userId);
  const timeZone = preferences?.timeZone ?? 'UTC';
  return { timeZone, today: todayInZone(timeZone), weekStart: preferences?.weekStart ?? 1 };
}

function assertSchedule(habit) {
  const { schedule, target, startDate, endDate } = habit;
  if (endDate && endDate < startDate) throw fieldError('endDate', 'end_before_start');
  if (schedule.mode === 'flexible' && schedule.period === 'week' && schedule.timesPerPeriod > 7) {
    throw fieldError('schedule.timesPerPeriod', 'too_big_number', { maximum: 7 });
  }
  if (target.kind === 'check' && target.value !== 1) {
    throw fieldError('target.value', 'invalid_value');
  }
  const times = habit.reminders.map((reminder) => reminder.time);
  if (new Set(times).size !== times.length) throw fieldError('reminders', 'duplicate_value');
}

// --- Habits ----------------------------------------------------------------------------

export async function listHabits(auth, { archived = 'false', categoryId } = {}) {
  const filter = {};
  if (archived === 'true') filter.archivedAt = { $ne: null };
  if (archived === 'false') filter.archivedAt = null;
  if (categoryId) filter.categoryId = categoryId;
  const { items } = await habitService.find(auth, filter, { sort: { sortOrder: 1, createdAt: 1 } });
  return items.map(serializeHabit);
}

export async function createHabit(auth, { id, ...input }) {
  await assertCategory(auth, input.categoryId);
  const { today } = await getUserCalendar(auth.userId);
  const attributes = { ...input, startDate: input.startDate ?? today };
  assertSchedule({ ...attributes, endDate: attributes.endDate ?? null });
  return serializeHabit(await habitService.create(auth, attributes, { id }));
}

export async function getHabit(auth, id) {
  return serializeHabit(await habitService.getById(auth, id));
}

export async function updateHabit(auth, id, { baseVersion, ...patch }) {
  if (patch.categoryId !== undefined) await assertCategory(auth, patch.categoryId);
  const intendedFields = Object.keys(patch);
  const { document } = await habitService.mutate(
    auth,
    id,
    (habit) => {
      assignPatch(habit, patch);
      assertSchedule(habit);
    },
    { baseVersion, intendedFields },
  );
  return serializeHabit(document);
}

export async function setHabitArchived(auth, id, archived) {
  const { document } = await habitService.mutate(auth, id, (habit) => {
    if (Boolean(habit.archivedAt) !== archived) habit.archivedAt = archived ? new Date() : null;
  });
  return serializeHabit(document);
}

/** Deletes a habit together with its recorded entries. */
export async function deleteHabit(auth, id) {
  await habitService.remove(auth, id);
  const entries = await HabitEntry.find({ userId: auth.userId, habitId: id, deletedAt: null })
    .select('_id')
    .lean();
  for (const entry of entries) {
    await habitEntryService.remove(auth, entry._id);
  }
}

detachOnDelete({ service: habitService, field: 'categoryId', targetType: ENTITY_TYPES.CATEGORY });

// --- Entries ---------------------------------------------------------------------------

function entriesOf(userId, habitIds, from, to) {
  return HabitEntry.find({
    userId,
    habitId: { $in: habitIds },
    deletedAt: null,
    // An occurrence postponed into the range matters even when its own date is outside.
    $or: [{ date: { $gte: from, $lte: to } }, { postponedTo: { $gte: from, $lte: to } }],
  });
}

function groupByHabit(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const list = groups.get(entry.habitId) ?? [];
    list.push(entry);
    groups.set(entry.habitId, list);
  }
  return groups;
}

function describeDay(habit, date, index, calendar) {
  const { state, due, entry } = dayState(habit, date, index, calendar.today);
  const target = entry?.target ?? habit.target.value;
  const value = entry?.value ?? 0;
  return {
    habitId: String(habit._id),
    date,
    state,
    due,
    value,
    target,
    progress: Math.min(1, value / target),
    entry: entry ? serializeHabitEntry(entry) : null,
    period:
      habit.schedule.mode === 'flexible'
        ? periodProgress(habit, date, index, calendar.weekStart)
        : null,
    streak: computeStreaks(habit, index, calendar.today, calendar.weekStart),
  };
}

/**
 * Everything needed to show one day: each habit that is relevant on `date` with its state,
 * progress and current streak, plus a summary.
 *
 * A habit is relevant when it is due that day, belongs to a flexible schedule that is active
 * that day, or has something recorded for the day.
 */
export async function getDay(auth, date) {
  const calendar = await getUserCalendar(auth.userId);
  const day = date ?? calendar.today;

  const { items: habits } = await habitService.find(
    auth,
    { archivedAt: null, startDate: { $lte: day } },
    { sort: { sortOrder: 1, createdAt: 1 } },
  );
  const historyFrom = addDays(maxDate(day, calendar.today), -STREAK_HORIZON_DAYS);
  const entries = await entriesOf(
    auth.userId,
    habits.map((habit) => String(habit._id)),
    historyFrom,
    maxDate(day, calendar.today),
  );
  const grouped = groupByHabit(entries);

  const items = [];
  for (const habit of habits) {
    const index = indexEntries(grouped.get(String(habit._id)) ?? []);
    const described = describeDay(habit, day, index, calendar);
    const flexibleActive = habit.schedule.mode === 'flexible' && isWithinLifetime(habit, day);
    if (described.due || flexibleActive || described.entry) {
      items.push({ ...described, habit: serializeHabit(habit) });
    }
  }

  const dueItems = items.filter((item) => item.due);
  const judged = dueItems.filter((item) => !['skipped', 'postponed'].includes(item.state));
  const completed = judged.filter((item) => item.state === 'completed').length;
  return {
    date: day,
    today: calendar.today,
    items,
    summary: {
      due: judged.length,
      completed,
      skipped: dueItems.filter((item) => item.state === 'skipped').length,
      postponed: dueItems.filter((item) => item.state === 'postponed').length,
      // Share of the day's judged due habits that are completed; null when nothing is due.
      rate: judged.length === 0 ? null : completed / judged.length,
    },
  };
}

function assertRange(from, to) {
  if (to < from) throw fieldError('to', 'end_before_start');
  if (diffDays(from, to) > MAX_RANGE_DAYS) {
    throw fieldError('to', 'range_too_long', { maximum: MAX_RANGE_DAYS });
  }
}

/** Day-by-day states of one habit, for calendars and heat maps. */
export async function getHabitHistory(auth, habitId, { from, to }) {
  assertRange(from, to);
  const [habit, calendar] = await Promise.all([
    habitService.getById(auth, habitId),
    getUserCalendar(auth.userId),
  ]);
  const index = indexEntries(await entriesOf(auth.userId, [habitId], from, to));

  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const { state, due, entry } = dayState(habit, date, index, calendar.today);
    days.push({
      date,
      state,
      due,
      value: entry?.value ?? 0,
      target: entry?.target ?? habit.target.value,
      note: entry?.note ?? '',
      entryId: entry ? String(entry._id) : null,
    });
  }
  return { habitId, from, to, today: calendar.today, days };
}

/** Streaks and completion figures of one habit. */
export async function getHabitStats(auth, habitId) {
  const [habit, calendar] = await Promise.all([
    habitService.getById(auth, habitId),
    getUserCalendar(auth.userId),
  ]);
  const { today, weekStart } = calendar;
  const from = addDays(today, -STREAK_HORIZON_DAYS);
  const index = indexEntries(await entriesOf(auth.userId, [habitId], from, today));

  const window = (days) => {
    const { byWeekday, ...figures } = computeCompletion(
      habit,
      index,
      addDays(today, -(days - 1)),
      today,
      today,
      weekStart,
    );
    return { days, ...figures };
  };
  const overall = computeCompletion(habit, index, habit.startDate, today, today, weekStart);
  let totalCompletions = 0;
  let totalValue = 0;
  for (const entry of index.byDate.values()) {
    if (entry.status !== 'active') continue;
    totalValue += entry.value;
    if (entry.value >= entry.target) totalCompletions += 1;
  }

  return {
    habitId,
    today,
    streak: computeStreaks(habit, index, today, weekStart),
    streakGoal: habit.streakGoal ?? null,
    totalCompletions,
    totalValue,
    windows: [window(7), window(30), window(90)],
    byWeekday: overall.byWeekday,
    // The unit that `due`, `completed` and `missed` count.
    unit: habit.schedule.mode === 'flexible' ? `${habit.schedule.period}s` : 'days',
  };
}

function assertEntryDate(habit, date, today) {
  if (!isWithinLifetime(habit, date)) throw fieldError('date', 'outside_habit_dates');
  // One day of tolerance for a device that is ahead of the account's time zone.
  if (date > addDays(today, 1)) throw fieldError('date', 'date_in_future');
}

/**
 * Records what happened to a habit on a day: progress (`value` or `increment`), a skip, a
 * postponement, or a note. Creates the day's entry or updates the existing one.
 */
export async function setEntry(auth, habitId, date, input) {
  const [habit, calendar] = await Promise.all([
    habitService.getById(auth, habitId),
    getUserCalendar(auth.userId),
  ]);
  assertEntryDate(habit, date, calendar.today);

  const status = input.status ?? 'active';
  if (status === 'postponed') {
    const { postponedTo } = input;
    if (!postponedTo || postponedTo <= date) throw fieldError('postponedTo', 'must_be_later');
    if (diffDays(date, postponedTo) > MAX_POSTPONE_DAYS || !isWithinLifetime(habit, postponedTo)) {
      throw fieldError('postponedTo', 'outside_habit_dates');
    }
  }

  const apply = (entry) => {
    let value = entry.value ?? 0;
    if (input.value !== undefined) value = input.value;
    if (input.increment !== undefined) value = Math.max(0, value + input.increment);

    entry.status = status;
    entry.postponedTo = status === 'postponed' ? input.postponedTo : null;
    // A skipped or postponed day carries no progress.
    entry.value = status === 'active' ? value : 0;
    entry.target = habit.target.value;
    if (input.note !== undefined) entry.note = input.note;

    const completed = entry.status === 'active' && entry.value >= entry.target;
    if (completed && !entry.completedAt) entry.completedAt = new Date();
    if (!completed) entry.completedAt = null;
  };

  const findLive = () =>
    HabitEntry.findOne({ userId: auth.userId, habitId, date, deletedAt: null }).select('_id');

  let existing = await findLive();
  if (!existing) {
    const draft = { value: 0, completedAt: null };
    apply(draft);
    try {
      await habitEntryService.create(auth, { habitId, date, note: '', ...draft });
    } catch (error) {
      // Another request created the day's entry at the same moment: update that one.
      if (error?.code !== 11000) throw error;
      existing = await findLive();
      if (!existing) throw error;
    }
  }
  if (existing) {
    await habitEntryService.mutate(auth, existing._id, apply);
  }
  return describeHabitDay(auth, habit, date, calendar);
}

/** Removes what was recorded for a habit on a day, returning the day to its natural state. */
export async function clearEntry(auth, habitId, date) {
  const [habit, calendar] = await Promise.all([
    habitService.getById(auth, habitId),
    getUserCalendar(auth.userId),
  ]);
  const existing = await HabitEntry.findOne({
    userId: auth.userId,
    habitId,
    date,
    deletedAt: null,
  }).select('_id');
  if (!existing) throw notFound();
  await habitEntryService.remove(auth, existing._id);
  return describeHabitDay(auth, habit, date, calendar);
}

async function describeHabitDay(auth, habit, date, calendar) {
  const habitId = String(habit._id);
  const to = maxDate(date, calendar.today);
  const entries = await entriesOf(auth.userId, [habitId], addDays(to, -STREAK_HORIZON_DAYS), to);
  return {
    ...describeDay(habit, date, indexEntries(entries), calendar),
    habit: serializeHabit(habit),
  };
}
