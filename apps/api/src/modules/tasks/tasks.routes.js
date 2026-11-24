import { TASK_PRIORITIES, TASK_STATUSES } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { recurrenceSchema } from '../../core/recurrence.js';
import { createModule, withMeta } from '../../core/routing.js';
import {
  baseVersionSchema,
  idSchema,
  localDateSchema,
  paginationMeta,
  paginationMetaSchema,
  paginationQuery,
  timeOfDaySchema,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import { MAX_SUBTASKS } from './task.model.js';
import {
  addSubtask,
  completeTask,
  createTask,
  deleteTask,
  getTask,
  getTaskDay,
  listTasks,
  postponeTask,
  removeSubtask,
  reopenTask,
  updateSubtask,
  updateTask,
} from './tasks.service.js';

export const taskSchema = z
  .strictObject({
    ...syncedResourceFields,
    title: z.string(),
    description: z.string(),
    categoryId: z.string().nullable(),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    startDate: z.string().nullable(),
    dueDate: z.string().nullable().describe('Calendar date in the user’s time zone'),
    dueTime: z.string().nullable().describe('Optional time of day, HH:mm'),
    scheduledDate: z.string().nullable().describe('Day of the planned time block'),
    scheduledTime: z.string().nullable(),
    durationMinutes: z.number().nullable(),
    completedAt: z.string().nullable(),
    completedOn: z
      .string()
      .nullable()
      .describe('The user’s calendar date when the task was completed'),
    originalDueDate: z
      .string()
      .nullable()
      .describe('The first due date, kept when the task is moved'),
    postponedCount: z.int(),
    subtasks: z.array(z.strictObject({ id: z.string(), title: z.string(), done: z.boolean() })),
    recurrence: recurrenceSchema.nullable().describe('Null for a task that does not repeat'),
    recurrenceEndDate: z.string().nullable(),
    seriesId: z.string().nullable().describe('Shared by all occurrences of a repeating task'),
    goalId: z.string().nullable(),
    habitId: z.string().nullable(),
    sortOrder: z.number(),
  })
  .describe('Task');

const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
  categoryId: idSchema.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  startDate: localDateSchema.nullable(),
  dueDate: localDateSchema.nullable(),
  dueTime: timeOfDaySchema.nullable(),
  scheduledDate: localDateSchema.nullable(),
  scheduledTime: timeOfDaySchema.nullable(),
  durationMinutes: z.int().min(5).max(1440).nullable(),
  recurrence: recurrenceSchema.nullable(),
  recurrenceEndDate: localDateSchema.nullable(),
  goalId: idSchema.nullable(),
  habitId: idSchema.nullable(),
  sortOrder: z.number().min(0).max(100000),
};

const optional = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()]));

const taskParams = z.strictObject({ taskId: idSchema });
const subtaskParams = z.strictObject({ taskId: idSchema, subtaskId: idSchema });

const tasks = createModule({
  tag: 'Tasks',
  description:
    'Tasks with priorities, dates, planned time blocks, subtasks and recurrence. A repeating ' +
    'task is a series of individual tasks: completing one creates the next occurrence.',
  basePath: '/tasks',
});

tasks.get(
  '',
  {
    summary: 'List tasks',
    query: z.strictObject({
      status: z
        .enum([...TASK_STATUSES, 'open', 'all'])
        .default('open')
        .describe('`open` is `todo` and `in_progress`'),
      priority: z.enum(TASK_PRIORITIES).optional(),
      categoryId: idSchema.optional(),
      goalId: idSchema.optional(),
      habitId: idSchema.optional(),
      dueFrom: localDateSchema.optional(),
      dueTo: localDateSchema.optional(),
      dated: z.enum(['true', 'false']).optional().describe('Only tasks with / without a due date'),
      search: z.string().trim().min(1).max(100).optional().describe('Text in the title'),
      sort: z.enum(['due', 'created', 'completed', 'manual']).default('due'),
      ...paginationQuery,
    }),
    response: z.array(taskSchema),
    responseMeta: paginationMetaSchema.extend({
      today: z.string().describe('Today in the user’s time zone, to judge what is overdue'),
    }),
  },
  async ({ auth, query }) => {
    const { items, total, today } = await listTasks(auth, query);
    return withMeta(items, { ...paginationMeta({ ...query, total }), today });
  },
);

tasks.post(
  '',
  {
    summary: 'Create a task',
    body: z.strictObject({
      id: idSchema.optional().describe('Optional client-generated id'),
      title: taskFields.title,
      description: taskFields.description.default(''),
      categoryId: taskFields.categoryId.default(null),
      priority: taskFields.priority.default('none'),
      status: taskFields.status.default('todo'),
      startDate: taskFields.startDate.default(null),
      dueDate: taskFields.dueDate.default(null),
      dueTime: taskFields.dueTime.default(null),
      scheduledDate: taskFields.scheduledDate.default(null),
      scheduledTime: taskFields.scheduledTime.default(null),
      durationMinutes: taskFields.durationMinutes.default(null),
      subtasks: z
        .array(z.strictObject({ title: z.string().trim().min(1).max(200) }))
        .max(MAX_SUBTASKS)
        .default([]),
      recurrence: taskFields.recurrence
        .default(null)
        .describe('A repeating task needs a due date; the rule is counted from it'),
      recurrenceEndDate: taskFields.recurrenceEndDate.default(null),
      goalId: taskFields.goalId.default(null),
      habitId: taskFields.habitId.default(null),
      sortOrder: taskFields.sortOrder.default(0),
    }),
    response: taskSchema,
    status: 201,
    errors: ['ID_ALREADY_EXISTS', 'LIMIT_EXCEEDED'],
  },
  ({ auth, body }) => createTask(auth, body),
);

tasks.get(
  '/day',
  {
    summary: 'Get the tasks of one day',
    description:
      'Overdue tasks (today only), tasks due or scheduled on the day, and tasks completed on ' +
      'it. Defaults to today in the user’s time zone.',
    query: z.strictObject({ date: localDateSchema.optional() }),
    response: z.strictObject({
      date: z.string(),
      today: z.string(),
      overdue: z.array(taskSchema),
      due: z.array(taskSchema),
      completed: z.array(taskSchema),
      summary: z.strictObject({ total: z.int(), done: z.int(), overdue: z.int() }),
    }),
  },
  ({ auth, query }) => getTaskDay(auth, query.date),
);

tasks.get(
  '/:taskId',
  { summary: 'Get a task', params: taskParams, response: taskSchema, errors: ['NOT_FOUND'] },
  ({ auth, params }) => getTask(auth, params.taskId),
);

tasks.patch(
  '/:taskId',
  {
    summary: 'Update a task',
    description:
      'Partial update. Changing the due date keeps the first one in `originalDueDate`. ' +
      'Setting `recurrence` starts a series; `null` ends it.',
    params: taskParams,
    body: z.strictObject({ ...optional(taskFields), baseVersion: baseVersionSchema }),
    response: taskSchema,
    errors: ['NOT_FOUND', 'VERSION_CONFLICT', 'CONFLICT'],
  },
  ({ auth, params, body }) => updateTask(auth, params.taskId, body),
);

tasks.delete(
  '/:taskId',
  { summary: 'Delete a task', params: taskParams, status: 204, errors: ['NOT_FOUND'] },
  ({ auth, params }) => deleteTask(auth, params.taskId),
);

tasks.post(
  '/:taskId/complete',
  {
    summary: 'Complete a task',
    description:
      'For a repeating task the next occurrence is created and returned as `next`. ' +
      'Completing the same occurrence again never creates a duplicate.',
    params: taskParams,
    response: z.strictObject({ task: taskSchema, next: taskSchema.nullable() }),
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => completeTask(auth, params.taskId),
);

tasks.post(
  '/:taskId/reopen',
  {
    summary: 'Reopen a completed or cancelled task',
    params: taskParams,
    response: taskSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => reopenTask(auth, params.taskId),
);

tasks.post(
  '/:taskId/postpone',
  {
    summary: 'Move an open task to a later day',
    params: taskParams,
    body: z.strictObject({ to: localDateSchema }),
    response: taskSchema,
    errors: ['NOT_FOUND', 'INVALID_STATE', 'CONFLICT'],
  },
  ({ auth, params, body }) => postponeTask(auth, params.taskId, body),
);

tasks.post(
  '/:taskId/subtasks',
  {
    summary: 'Add a subtask',
    params: taskParams,
    body: z.strictObject({ title: z.string().trim().min(1).max(200) }),
    response: taskSchema,
    status: 201,
    errors: ['NOT_FOUND', 'LIMIT_EXCEEDED'],
  },
  ({ auth, params, body }) => addSubtask(auth, params.taskId, body),
);

tasks.patch(
  '/:taskId/subtasks/:subtaskId',
  {
    summary: 'Rename or tick a subtask',
    params: subtaskParams,
    body: z.strictObject({
      title: z.string().trim().min(1).max(200).optional(),
      done: z.boolean().optional(),
    }),
    response: taskSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, body }) => updateSubtask(auth, params.taskId, params.subtaskId, body),
);

tasks.delete(
  '/:taskId/subtasks/:subtaskId',
  {
    summary: 'Remove a subtask',
    params: subtaskParams,
    response: taskSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params }) => removeSubtask(auth, params.taskId, params.subtaskId),
);

export const tasksRouter = tasks.router;
