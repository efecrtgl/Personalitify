import {
  GOAL_HORIZONS,
  GOAL_PROGRESS_MODES,
  GOAL_STATUSES,
  ITEM_ICONS,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import {
  baseVersionSchema,
  hexColorSchema,
  idSchema,
  localDateSchema,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import { MAX_LINKED_HABITS } from './goal.model.js';
import {
  addMilestone,
  addReview,
  createGoal,
  deleteGoal,
  getGoalDetail,
  getGoalHistory,
  listGoals,
  removeMilestone,
  removeReview,
  updateGoal,
  updateMilestone,
} from './goals.service.js';

const progressSchema = z
  .strictObject({
    mode: z.enum(GOAL_PROGRESS_MODES),
    value: z.number().min(0).max(100).describe('Percentage, used by the `manual` mode'),
    current: z.number().min(0).max(1e12).describe('Current amount, used by the `metric` mode'),
    target: z.number().positive().max(1e12).describe('Target amount, used by the `metric` mode'),
    unit: z.string().trim().max(20),
  })
  .describe(
    'How progress is determined: `manual` (a percentage), `milestones` (share of completed ' +
      'milestones), `tasks` (share of completed linked tasks) or `metric` (current / target).',
  );

const milestoneSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  targetDate: z.string().nullable(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
});

const reviewSchema = z.strictObject({
  id: z.string(),
  date: z.string(),
  note: z.string(),
  rating: z.number().nullable(),
  percent: z.number().describe('Progress of the goal when the review was written'),
});

export const goalSchema = z
  .strictObject({
    ...syncedResourceFields,
    title: z.string(),
    description: z.string(),
    categoryId: z.string().nullable(),
    color: z.string(),
    icon: z.enum(ITEM_ICONS),
    horizon: z.enum(GOAL_HORIZONS),
    startDate: z.string(),
    targetDate: z.string().nullable(),
    status: z.enum(GOAL_STATUSES),
    completedAt: z.string().nullable(),
    progress: progressSchema,
    milestones: z.array(milestoneSchema),
    reviews: z.array(reviewSchema),
    parentGoalId: z.string().nullable(),
    habitIds: z.array(z.string()),
    sortOrder: z.number(),
  })
  .describe('Goal');

export const goalViewSchema = goalSchema
  .extend({
    computed: z
      .strictObject({
        percent: z.number().describe('Progress from 0 to 100, by the goal’s progress mode'),
        milestones: z.strictObject({ total: z.int(), done: z.int() }),
        tasks: z
          .strictObject({ total: z.int(), done: z.int(), open: z.int() })
          .describe('Linked tasks; cancelled tasks are not counted'),
        daysLeft: z
          .int()
          .nullable()
          .describe('Days until the target date in the user’s time zone; negative when past'),
        overdue: z.boolean(),
      })
      .describe('Figures derived by the server; not part of the synchronized resource'),
  })
  .describe('Goal with derived figures');

const goalFields = {
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  categoryId: idSchema.nullable(),
  color: hexColorSchema,
  icon: z.enum(ITEM_ICONS),
  horizon: z.enum(GOAL_HORIZONS),
  startDate: localDateSchema,
  targetDate: localDateSchema.nullable(),
  status: z.enum(GOAL_STATUSES),
  parentGoalId: idSchema.nullable(),
  habitIds: z.array(idSchema).max(MAX_LINKED_HABITS),
  sortOrder: z.number().min(0).max(100000),
};

const goalParams = z.strictObject({ goalId: idSchema });

const goals = createModule({
  tag: 'Goals',
  description:
    'Short- and long-term goals with milestones, sub-goals, reviews and links to habits and ' +
    'tasks. Responses carry a `computed` object with the derived progress.',
  basePath: '/goals',
});

goals.get(
  '',
  {
    summary: 'List goals',
    query: z.strictObject({
      status: z
        .enum([...GOAL_STATUSES, 'open', 'all'])
        .default('open')
        .describe('`open` is active and paused goals'),
      horizon: z.enum(GOAL_HORIZONS).optional(),
      categoryId: idSchema.optional(),
      parentGoalId: z
        .union([idSchema, z.literal('none')])
        .optional()
        .describe('Sub-goals of a goal, or `none` for top-level goals'),
    }),
    response: z.array(goalViewSchema),
  },
  ({ auth, query }) => listGoals(auth, query),
);

goals.post(
  '',
  {
    summary: 'Create a goal',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      title: goalFields.title,
      description: goalFields.description.default(''),
      categoryId: goalFields.categoryId.default(null),
      color: goalFields.color,
      icon: goalFields.icon.default('target'),
      horizon: goalFields.horizon.default('short'),
      startDate: goalFields.startDate.optional().describe('Defaults to today'),
      targetDate: goalFields.targetDate.default(null),
      status: goalFields.status.default('active'),
      progress: progressSchema
        .partial()
        .default({})
        .describe('Defaults to the `manual` mode at 0%'),
      parentGoalId: goalFields.parentGoalId.default(null),
      habitIds: goalFields.habitIds.default([]),
      sortOrder: goalFields.sortOrder.default(0),
    }),
    response: goalViewSchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createGoal(auth, body),
);

goals.get(
  '/:goalId',
  {
    summary: 'Get a goal with its sub-goals and linked habits',
    params: goalParams,
    response: z.strictObject({
      goal: goalViewSchema,
      subGoals: z.array(goalViewSchema),
      habits: z.array(
        z.strictObject({
          id: z.string(),
          name: z.string(),
          color: z.string(),
          icon: z.enum(ITEM_ICONS),
          archived: z.boolean(),
        }),
      ),
    }),
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => getGoalDetail(auth, params.goalId),
);

goals.patch(
  '/:goalId',
  {
    summary: 'Update a goal',
    description:
      'Partial update; `progress` is merged key by key. Setting `status` to `completed` ' +
      'records the completion time.',
    params: goalParams,
    body: z.strictObject({
      title: goalFields.title.optional(),
      description: goalFields.description.optional(),
      categoryId: goalFields.categoryId.optional(),
      color: goalFields.color.optional(),
      icon: goalFields.icon.optional(),
      horizon: goalFields.horizon.optional(),
      startDate: goalFields.startDate.optional(),
      targetDate: goalFields.targetDate.optional(),
      status: goalFields.status.optional(),
      progress: progressSchema.partial().optional(),
      parentGoalId: goalFields.parentGoalId.optional(),
      habitIds: goalFields.habitIds.optional(),
      sortOrder: goalFields.sortOrder.optional(),
      baseVersion: baseVersionSchema,
    }),
    response: goalViewSchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT'],
  },
  ({ auth, params, body }) => updateGoal(auth, params.goalId, body),
);

goals.delete(
  '/:goalId',
  {
    summary: 'Delete a goal',
    description: 'Sub-goals become top-level goals and linked tasks are unlinked, not deleted.',
    params: goalParams,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => deleteGoal(auth, params.goalId),
);

goals.get(
  '/:goalId/history',
  {
    summary: 'Recent changes of a goal',
    description: 'The latest 50 changes, newest first, with the fields each one changed.',
    params: goalParams,
    response: z.array(
      z.strictObject({
        eventId: z.string(),
        event: z.string(),
        version: z.int(),
        at: z.string(),
        changedFields: z.array(z.string()),
        status: z.string().nullable(),
      }),
    ),
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => getGoalHistory(auth, params.goalId),
);

const milestoneParams = z.strictObject({ goalId: idSchema, milestoneId: idSchema });

goals.post(
  '/:goalId/milestones',
  {
    summary: 'Add a milestone',
    params: goalParams,
    body: z.strictObject({
      id: idSchema.optional(),
      title: z.string().trim().min(1).max(160),
      targetDate: localDateSchema.nullable().default(null),
    }),
    response: goalViewSchema,
    status: 201,
    errors: ['NOT_FOUND', 'LIMIT_EXCEEDED'],
  },
  ({ auth, params, body }) => addMilestone(auth, params.goalId, body),
);

goals.patch(
  '/:goalId/milestones/:milestoneId',
  {
    summary: 'Update or complete a milestone',
    params: milestoneParams,
    body: z.strictObject({
      title: z.string().trim().min(1).max(160).optional(),
      targetDate: localDateSchema.nullable().optional(),
      done: z.boolean().optional(),
    }),
    response: goalViewSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, body }) => updateMilestone(auth, params.goalId, params.milestoneId, body),
);

goals.delete(
  '/:goalId/milestones/:milestoneId',
  {
    summary: 'Remove a milestone',
    params: milestoneParams,
    response: goalViewSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => removeMilestone(auth, params.goalId, params.milestoneId),
);

goals.post(
  '/:goalId/reviews',
  {
    summary: 'Add a review',
    description:
      'A dated reflection on the goal. The goal’s progress at that moment is recorded with it.',
    params: goalParams,
    body: z.strictObject({
      date: localDateSchema.optional().describe('Defaults to today'),
      note: z.string().trim().min(1).max(2000),
      rating: z.int().min(1).max(5).nullable().default(null),
    }),
    response: goalViewSchema,
    status: 201,
    errors: ['NOT_FOUND', 'LIMIT_EXCEEDED'],
  },
  ({ auth, params, body }) => addReview(auth, params.goalId, body),
);

goals.delete(
  '/:goalId/reviews/:reviewId',
  {
    summary: 'Remove a review',
    params: z.strictObject({ goalId: idSchema, reviewId: idSchema }),
    response: goalViewSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => removeReview(auth, params.goalId, params.reviewId),
);

export const goalsRouter = goals.router;
