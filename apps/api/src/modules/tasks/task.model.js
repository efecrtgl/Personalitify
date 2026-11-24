import { randomUUID } from 'node:crypto';
import { TASK_PRIORITIES, TASK_STATUSES } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { recurrenceFields, serializeRecurrence } from '../../core/recurrence.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_SUBTASKS = 50;

const subtaskSchema = new mongoose.Schema(
  {
    id: { type: String, default: randomUUID },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 4000 },
    categoryId: { type: String, default: null },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'none' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },

    // Calendar dates and wall-clock times in the user's time zone.
    startDate: { type: String, default: null, match: LOCAL_DATE },
    dueDate: { type: String, default: null, match: LOCAL_DATE },
    dueTime: { type: String, default: null, match: TIME_OF_DAY },

    // A planned block of time for working on the task; shown in the calendar.
    scheduledDate: { type: String, default: null, match: LOCAL_DATE },
    scheduledTime: { type: String, default: null, match: TIME_OF_DAY },
    durationMinutes: { type: Number, default: null, min: 5, max: 1440 },

    completedAt: { type: Date, default: null },
    // The user's calendar date at the moment of completion, for daily views and statistics.
    completedOn: { type: String, default: null, match: LOCAL_DATE },

    // Postponing never loses the date a task was first due.
    originalDueDate: { type: String, default: null, match: LOCAL_DATE },
    postponedCount: { type: Number, default: 0, min: 0 },

    // Bounded embedded list.
    subtasks: {
      type: [subtaskSchema],
      default: [],
      validate: (value) => value.length <= MAX_SUBTASKS,
    },

    // Recurring tasks: every occurrence is its own task; completing one creates the next.
    recurring: { type: Boolean, default: false },
    recurrence: recurrenceFields,
    recurrenceEndDate: { type: String, default: null, match: LOCAL_DATE },
    // Shared by all occurrences of a recurring task.
    seriesId: { type: String, default: null },
    // Date the rule is counted from; constant within a series.
    seriesStartDate: { type: String, default: null, match: LOCAL_DATE },

    goalId: { type: String, default: null },
    habitId: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
  },
  { collection: 'tasks' },
);

taskSchema.plugin(syncedEntity);
taskSchema.path('recurrence.frequency').required(false);
taskSchema.index({ userId: 1, deletedAt: 1, status: 1, dueDate: 1 });
taskSchema.index({ userId: 1, deletedAt: 1, scheduledDate: 1 });
taskSchema.index({ userId: 1, deletedAt: 1, completedOn: 1 });
taskSchema.index({ userId: 1, goalId: 1 });
taskSchema.index({ userId: 1, habitId: 1 });
taskSchema.index({ userId: 1, categoryId: 1 });
// One live occurrence per series and due date: makes creating the next occurrence idempotent.
taskSchema.index(
  { userId: 1, seriesId: 1, dueDate: 1 },
  {
    unique: true,
    partialFilterExpression: { seriesId: { $type: 'string' }, deletedAt: { $type: 'null' } },
  },
);

export const Task = mongoose.model('Task', taskSchema);

export function serializeTask(task) {
  return {
    ...baseResource(task),
    title: task.title,
    description: task.description,
    categoryId: task.categoryId ?? null,
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    dueTime: task.dueTime ?? null,
    scheduledDate: task.scheduledDate ?? null,
    scheduledTime: task.scheduledTime ?? null,
    durationMinutes: task.durationMinutes ?? null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    completedOn: task.completedOn ?? null,
    originalDueDate: task.originalDueDate ?? null,
    postponedCount: task.postponedCount,
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      title: subtask.title,
      done: subtask.done,
    })),
    recurrence: task.recurring ? serializeRecurrence(task.recurrence) : null,
    recurrenceEndDate: task.recurring ? (task.recurrenceEndDate ?? null) : null,
    seriesId: task.seriesId ?? null,
    goalId: task.goalId ?? null,
    habitId: task.habitId ?? null,
    sortOrder: task.sortOrder,
  };
}
