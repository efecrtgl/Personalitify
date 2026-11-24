import { ITEM_ICONS } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

/**
 * A user-defined label shared by habits, goals, tasks and calendar events, so that
 * "Health" or "Work" means the same thing everywhere in the product.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    color: { type: String, required: true, match: /^#[0-9a-fA-F]{6}$/ },
    icon: { type: String, enum: ITEM_ICONS, default: 'star' },
    sortOrder: { type: Number, default: 0 },
  },
  { collection: 'categories' },
);

categorySchema.plugin(syncedEntity);
categorySchema.index({ userId: 1, deletedAt: 1, sortOrder: 1 });

export const Category = mongoose.model('Category', categorySchema);

export function serializeCategory(category) {
  return {
    ...baseResource(category),
    name: category.name,
    color: category.color,
    icon: category.icon,
    sortOrder: category.sortOrder,
  };
}
