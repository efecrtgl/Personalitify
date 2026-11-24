import { ITEM_ICONS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { baseVersionSchema, hexColorSchema, idSchema } from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from './categories.service.js';

export const categorySchema = z
  .strictObject({
    ...syncedResourceFields,
    name: z.string(),
    color: z.string(),
    icon: z.enum(ITEM_ICONS),
    sortOrder: z.number(),
  })
  .describe('Category');

const categoryInput = {
  name: z.string().trim().min(1).max(40),
  color: hexColorSchema,
  icon: z.enum(ITEM_ICONS),
  sortOrder: z.number().min(0).max(100000),
};

const params = z.strictObject({ categoryId: idSchema });

const categories = createModule({
  tag: 'Categories',
  description: 'User-defined labels shared by habits, goals, tasks and calendar events.',
  basePath: '/categories',
});

categories.get('', { summary: 'List categories', response: z.array(categorySchema) }, ({ auth }) =>
  listCategories(auth),
);

categories.post(
  '',
  {
    summary: 'Create a category',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      name: categoryInput.name,
      color: categoryInput.color,
      icon: categoryInput.icon.default('star'),
      sortOrder: categoryInput.sortOrder.default(0),
    }),
    response: categorySchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createCategory(auth, body),
);

categories.patch(
  '/:categoryId',
  {
    summary: 'Update a category',
    params,
    body: z.strictObject({
      name: categoryInput.name.optional(),
      color: categoryInput.color.optional(),
      icon: categoryInput.icon.optional(),
      sortOrder: categoryInput.sortOrder.optional(),
      baseVersion: baseVersionSchema,
    }),
    response: categorySchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params: { categoryId }, body }) => updateCategory(auth, categoryId, body),
);

categories.delete(
  '/:categoryId',
  {
    summary: 'Delete a category',
    description: 'Items that used the category keep existing and lose the reference.',
    params,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params: { categoryId } }) => deleteCategory(auth, categoryId),
);

export const categoriesRouter = categories.router;
