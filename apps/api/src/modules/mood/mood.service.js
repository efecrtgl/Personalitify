import { ENTITY_TYPES, MOOD_EMOTIONS, MOOD_SCORES } from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { fieldError, notFound } from '../../core/errors.js';
import { addDays, diffDays, weekdayOf } from '../../core/time.js';
import { getUserCalendar } from '../habits/habits.service.js';
import { MoodEntry, serializeMoodEntry } from './mood-entry.model.js';

export const moodService = createEntityService({
  entityType: ENTITY_TYPES.MOOD_ENTRY,
  model: MoodEntry,
  serialize: serializeMoodEntry,
});

const MAX_RANGE_DAYS = 400;

const findLive = (userId, date) => MoodEntry.findOne({ userId, date, deletedAt: null });

/** Records how a day felt, replacing what was recorded for that day before. */
export async function setMood(auth, date, input) {
  const { today } = await getUserCalendar(auth.userId);
  // One day of tolerance for a device that is ahead of the account's time zone.
  if (date > addDays(today, 1)) throw fieldError('date', 'date_in_future');

  const apply = (entry) => {
    entry.score = input.score;
    if (input.emotions !== undefined) entry.emotions = [...new Set(input.emotions)];
    if (input.note !== undefined) entry.note = input.note;
  };

  let existing = await findLive(auth.userId, date);
  if (!existing) {
    try {
      const created = await moodService.create(auth, {
        date,
        score: input.score,
        emotions: [...new Set(input.emotions ?? [])],
        note: input.note ?? '',
      });
      return serializeMoodEntry(created);
    } catch (error) {
      // Another request recorded the day at the same moment: update that entry.
      if (error?.code !== 11000) throw error;
      existing = await findLive(auth.userId, date);
      if (!existing) throw error;
    }
  }
  const { document } = await moodService.mutate(auth, existing._id, apply);
  return serializeMoodEntry(document);
}

export async function clearMood(auth, date) {
  const existing = await findLive(auth.userId, date);
  if (!existing) throw notFound();
  await moodService.remove(auth, existing._id);
}

const average = (entries) =>
  entries.length === 0
    ? null
    : Math.round((entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length) * 100) /
      100;

/**
 * The mood entries of a range with what can be counted from them: the average, how often
 * each score and each feeling was recorded, and the average by weekday.
 */
export async function getMoodRange(auth, { from, to }) {
  if (to < from) throw fieldError('to', 'end_before_start');
  if (diffDays(from, to) > MAX_RANGE_DAYS) {
    throw fieldError('to', 'range_too_long', { maximum: MAX_RANGE_DAYS });
  }
  const [{ today }, { items }] = await Promise.all([
    getUserCalendar(auth.userId),
    moodService.find(auth, { date: { $gte: from, $lte: to } }, { sort: { date: 1 } }),
  ]);

  const emotionCounts = new Map();
  for (const entry of items) {
    for (const emotion of entry.emotions) {
      emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + 1);
    }
  }

  return {
    from,
    to,
    today,
    entries: items.map(serializeMoodEntry),
    summary: {
      count: items.length,
      average: average(items),
      distribution: MOOD_SCORES.map((score) => ({
        score,
        count: items.filter((entry) => entry.score === score).length,
      })),
      emotions: MOOD_EMOTIONS.filter((emotion) => emotionCounts.has(emotion))
        .map((emotion) => ({ emotion, count: emotionCounts.get(emotion) }))
        .sort((a, b) => b.count - a.count),
      byWeekday: Array.from({ length: 7 }, (_, index) => {
        const matching = items.filter((entry) => weekdayOf(entry.date) === index + 1);
        return { weekday: index + 1, count: matching.length, average: average(matching) };
      }),
    },
  };
}
