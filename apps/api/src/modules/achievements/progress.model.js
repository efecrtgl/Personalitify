import { ACHIEVEMENT_KEYS, XP_RULES } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The XP ledger: one row per thing that earned XP.
 *
 * `key` names the thing (`task:<id>`, `mood:<date>`, …) and is unique per user, which is
 * what makes granting idempotent: handling the same event twice writes the same row twice.
 * Undoing the thing deletes its row. The total is the sum of the rows, so it can always be
 * recomputed and never drifts.
 */
const xpGrantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, immutable: true },
    key: { type: String, required: true, immutable: true },
    rule: { type: String, enum: Object.keys(XP_RULES), required: true },
    amount: { type: Number, required: true, min: 1 },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    // The user's calendar date the XP belongs to.
    date: { type: String, required: true, match: LOCAL_DATE },
  },
  { collection: 'xpGrants', versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

xpGrantSchema.index({ userId: 1, key: 1 }, { unique: true });
xpGrantSchema.index({ userId: 1, entityType: 1, entityId: 1 });
xpGrantSchema.index({ userId: 1, date: 1 });
xpGrantSchema.index({ userId: 1, createdAt: -1 });

export const XpGrant = mongoose.model('XpGrant', xpGrantSchema);

export function serializeXpGrant(grant) {
  return {
    id: String(grant._id),
    rule: grant.rule,
    amount: grant.amount,
    entityType: grant.entityType,
    entityId: grant.entityId,
    date: grant.date,
    grantedAt: grant.createdAt.toISOString(),
  };
}

/** Per-user bookkeeping of the progress system; `_id` is the user id. */
const userProgressSchema = new mongoose.Schema(
  {
    _id: { type: String },
    // The longest habit streak in days ever observed. Only grows: an achievement reached
    // once stays reached even if the habit is deleted later.
    bestStreak: { type: Number, default: 0, min: 0 },
    // Set once XP has been granted for the records that existed before the progress system
    // was first used for this account.
    backfilledAt: { type: Date, default: null },
  },
  { collection: 'userProgress', versionKey: false, timestamps: true },
);

export const UserProgress = mongoose.model('UserProgress', userProgressSchema);

/** An achievement the user has unlocked. Never removed once reached. */
const achievementSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ACHIEVEMENT_KEYS, required: true, immutable: true },
    unlockedAt: { type: Date, required: true },
  },
  { collection: 'achievements' },
);

achievementSchema.plugin(syncedEntity);
achievementSchema.index(
  { userId: 1, key: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $type: 'null' } } },
);

// For listing a user's achievements; the partial unique index above cannot serve it.
achievementSchema.index({ userId: 1, deletedAt: 1 });

export const Achievement = mongoose.model('Achievement', achievementSchema);

export function serializeAchievement(achievement) {
  return {
    ...baseResource(achievement),
    key: achievement.key,
    unlockedAt: achievement.unlockedAt.toISOString(),
  };
}
