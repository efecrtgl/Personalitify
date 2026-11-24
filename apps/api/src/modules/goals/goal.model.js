import { randomUUID } from 'node:crypto';
import {
  GOAL_HORIZONS,
  GOAL_PROGRESS_MODES,
  GOAL_STATUSES,
  ITEM_ICONS,
} from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_MILESTONES = 50;
export const MAX_REVIEWS = 100;
export const MAX_LINKED_HABITS = 20;

const milestoneSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    targetDate: { type: String, default: null, match: LOCAL_DATE },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    date: { type: String, required: true, match: LOCAL_DATE },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    rating: { type: Number, default: null, min: 1, max: 5 },
    // Progress of the goal when the review was written.
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const goalSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    categoryId: { type: String, default: null },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    icon: { type: String, enum: ITEM_ICONS, default: 'target' },
    horizon: { type: String, enum: GOAL_HORIZONS, default: 'short' },
    startDate: { type: String, required: true, match: LOCAL_DATE },
    targetDate: { type: String, default: null, match: LOCAL_DATE },
    status: { type: String, enum: GOAL_STATUSES, default: 'active' },
    completedAt: { type: Date, default: null },

    progress: {
      mode: { type: String, enum: GOAL_PROGRESS_MODES, default: 'manual' },
      // `manual`: percentage set by the user.
      value: { type: Number, default: 0, min: 0, max: 100 },
      // `metric`: current amount against a target amount.
      current: { type: Number, default: 0, min: 0, max: 1e12 },
      target: { type: Number, default: 100, min: 0.000001, max: 1e12 },
      unit: { type: String, default: '', trim: true, maxlength: 20 },
    },

    // Bounded embedded lists (see the limits above).
    milestones: {
      type: [milestoneSchema],
      default: [],
      validate: (value) => value.length <= MAX_MILESTONES,
    },
    reviews: {
      type: [reviewSchema],
      default: [],
      validate: (value) => value.length <= MAX_REVIEWS,
    },

    parentGoalId: { type: String, default: null },
    habitIds: {
      type: [String],
      default: [],
      validate: (value) => value.length <= MAX_LINKED_HABITS,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { collection: 'goals' },
);

goalSchema.plugin(syncedEntity);
goalSchema.index({ userId: 1, deletedAt: 1, status: 1, sortOrder: 1 });
goalSchema.index({ userId: 1, parentGoalId: 1 });
goalSchema.index({ userId: 1, categoryId: 1 });
goalSchema.index({ userId: 1, habitIds: 1 });

export const Goal = mongoose.model('Goal', goalSchema);

export function serializeGoal(goal) {
  const { progress } = goal;
  return {
    ...baseResource(goal),
    title: goal.title,
    description: goal.description,
    categoryId: goal.categoryId ?? null,
    color: goal.color,
    icon: goal.icon,
    horizon: goal.horizon,
    startDate: goal.startDate,
    targetDate: goal.targetDate ?? null,
    status: goal.status,
    completedAt: goal.completedAt ? goal.completedAt.toISOString() : null,
    progress: {
      mode: progress.mode,
      value: progress.value,
      current: progress.current,
      target: progress.target,
      unit: progress.unit,
    },
    milestones: goal.milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      targetDate: milestone.targetDate ?? null,
      done: milestone.done,
      completedAt: milestone.completedAt ? milestone.completedAt.toISOString() : null,
    })),
    reviews: goal.reviews.map((review) => ({
      id: review.id,
      date: review.date,
      note: review.note,
      rating: review.rating ?? null,
      percent: review.percent,
    })),
    parentGoalId: goal.parentGoalId ?? null,
    habitIds: [...goal.habitIds],
    sortOrder: goal.sortOrder,
  };
}
