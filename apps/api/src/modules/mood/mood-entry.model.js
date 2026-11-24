import { MOOD_EMOTIONS } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How a day felt: one entry per calendar day in the user's time zone, on a five-step scale,
 * with optional feelings and a private note.
 */
const moodEntrySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, immutable: true, match: LOCAL_DATE },
    score: { type: Number, required: true, min: 1, max: 5 },
    emotions: {
      type: [{ type: String, enum: MOOD_EMOTIONS }],
      default: [],
      validate: (value) => value.length <= MOOD_EMOTIONS.length,
    },
    note: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { collection: 'moodEntries' },
);

moodEntrySchema.plugin(syncedEntity);
moodEntrySchema.index(
  { userId: 1, date: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);

export const MoodEntry = mongoose.model('MoodEntry', moodEntrySchema);

export function serializeMoodEntry(entry) {
  return {
    ...baseResource(entry),
    date: entry.date,
    score: entry.score,
    emotions: [...entry.emotions],
    note: entry.note,
  };
}
