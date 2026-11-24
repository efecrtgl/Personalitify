import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { fieldError } from '../../core/errors.js';
import { Category, serializeCategory } from './category.model.js';

export const categoryService = createEntityService({
  entityType: ENTITY_TYPES.CATEGORY,
  model: Category,
  serialize: serializeCategory,
  maxPerUser: 100,
});

export async function listCategories(auth) {
  const { items } = await categoryService.find(auth, {}, { sort: { sortOrder: 1, name: 1 } });
  return items.map(serializeCategory);
}

export async function createCategory(auth, { id, ...attributes }) {
  return serializeCategory(await categoryService.create(auth, attributes, { id }));
}

export async function updateCategory(auth, id, { baseVersion, ...patch }) {
  return serializeCategory(await categoryService.update(auth, id, patch, { baseVersion }));
}

/**
 * Deletes a category. Items that used it are detached by each module's own subscriber to
 * `category.deleted`, so their changes are versioned and synchronized like any other.
 */
export async function deleteCategory(auth, id) {
  await categoryService.remove(auth, id);
}

/** Throws a validation error unless `categoryId` is null or one of the user's categories. */
export async function assertCategory(auth, categoryId) {
  if (categoryId === null || categoryId === undefined) return;
  const exists = await Category.exists({ _id: categoryId, userId: auth.userId, deletedAt: null });
  if (!exists) throw fieldError('categoryId', 'unknown_reference');
}
