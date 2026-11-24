import { randomUUID } from 'node:crypto';
import { ENTITY_TYPES, ERROR_CODES, OPEN_TASK_STATUSES } from '@personalitify/shared-contracts';
import { assignPatch, createEntityService } from '../../core/entity/entity-service.js';
import { assertOwnedReferences, detachOnDelete } from '../../core/entity/references.js';
import { conflict, fieldError, limitExceeded, notFound } from '../../core/errors.js';
import { nextOccurrence, serializeRecurrence } from '../../core/recurrence.js';
import { addDays, diffDays } from '../../core/time.js';
import { assertCategory } from '../categories/categories.service.js';
import { goalService } from '../goals/goals.service.js';
import { getUserCalendar, habitService } from '../habits/habits.service.js';
import { MAX_SUBTASKS, Task, serializeTask } from './task.model.js';

export const taskService = createEntityService({
  entityType: ENTITY_TYPES.TASK,
  model: Task,
  serialize: serializeTask,
  maxPerUser: 5000,
});

detachOnDelete({ service: taskService, field: 'categoryId', targetType: ENTITY_TYPES.CATEGORY });
detachOnDelete({ service: taskService, field: 'goalId', targetType: ENTITY_TYPES.GOAL });
detachOnDelete({ service: taskService, field: 'habitId', targetType: ENTITY_TYPES.HABIT });

const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

/** Order within a list of a day: priority, time of day, creation, and finally title. */
function byUrgency(a, b) {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
    a.createdAt - b.createdAt ||
    a.title.localeCompare(b.title)
  );
}

async function assertReferences(auth, input) {
  if (input.categoryId !== undefined) await assertCategory(auth, input.categoryId);
  if (input.goalId !== undefined) {
    await assertOwnedReferences(auth, goalService, input.goalId, 'goalId');
  }
  if (input.habitId !== undefined) {
    await assertOwnedReferences(auth, habitService, input.habitId, 'habitId');
  }
}

function assertConsistent(task) {
  if (task.startDate && task.dueDate && task.dueDate < task.startDate) {
    throw fieldError('dueDate', 'end_before_start');
  }
  if (task.dueTime && !task.dueDate) throw fieldError('dueDate', 'required');
  if ((task.scheduledTime || task.durationMinutes) && !task.scheduledDate) {
    throw fieldError('scheduledDate', 'required');
  }
  if (task.recurring) {
    // The rule is counted from the due date, so a repeating task needs one.
    if (!task.dueDate) throw fieldError('dueDate', 'required');
    if (task.recurrenceEndDate && task.recurrenceEndDate < task.dueDate) {
      throw fieldError('recurrenceEndDate', 'end_before_start');
    }
  }
}

/** Applies a status and keeps the completion fields in step with it. */
function applyStatus(task, status, today) {
  if (status === task.status) return;
  task.status = status;
  if (status === 'done') {
    task.completedAt = new Date();
    task.completedOn = today;
  } else {
    task.completedAt = null;
    task.completedOn = null;
  }
}

/** Starts or ends a series when the recurrence of a task is set or cleared. */
function applyRecurrence(task, recurrence) {
  if (recurrence === undefined) return;
  if (recurrence === null) {
    task.recurring = false;
    task.seriesId = null;
    task.seriesStartDate = null;
    task.recurrenceEndDate = null;
    return;
  }
  task.set('recurrence', recurrence);
  if (!task.recurring) {
    task.recurring = true;
    task.seriesId = randomUUID();
    task.seriesStartDate = task.dueDate;
  }
}

/**
 * Creates the next occurrence of a recurring task that was just completed.
 *
 * Every occurrence is a task of its own, so each keeps its own completion, notes and
 * subtasks. A unique index on (series, due date) makes this idempotent: completing,
 * reopening and completing again never creates a second copy.
 */
async function createNextOccurrence(auth, task) {
  if (!task.recurring || !task.dueDate) return null;
  const next = nextOccurrence(task.recurrence, task.seriesStartDate, addDays(task.dueDate, 1), {
    endDate: task.recurrenceEndDate ?? undefined,
  });
  if (!next) return null;

  const shift = diffDays(task.dueDate, next);
  const moved = (date) => (date ? addDays(date, shift) : null);
  try {
    return await taskService.create(auth, {
      title: task.title,
      description: task.description,
      categoryId: task.categoryId,
      priority: task.priority,
      startDate: moved(task.startDate),
      dueDate: next,
      dueTime: task.dueTime,
      scheduledDate: moved(task.scheduledDate),
      scheduledTime: task.scheduledTime,
      durationMinutes: task.durationMinutes,
      subtasks: task.subtasks.map((subtask) => ({ title: subtask.title })),
      recurring: true,
      recurrence: serializeRecurrence(task.recurrence),
      recurrenceEndDate: task.recurrenceEndDate,
      seriesId: task.seriesId,
      seriesStartDate: task.seriesStartDate,
      goalId: task.goalId,
      habitId: task.habitId,
      sortOrder: task.sortOrder,
    });
  } catch (error) {
    if (error?.code === 11000) return null; // the next occurrence already exists
    throw error;
  }
}

/** Runs a task mutation and turns a clash with another occurrence into a clear conflict. */
async function mutateTask(auth, id, mutator, options) {
  try {
    return await taskService.mutate(auth, id, mutator, options);
  } catch (error) {
    // Two occurrences of one series cannot be due on the same day.
    if (error?.code === 11000) throw conflict(ERROR_CODES.CONFLICT);
    throw error;
  }
}

// --- Tasks -----------------------------------------------------------------------------

export async function createTask(auth, { id, recurrence, ...input }) {
  await assertReferences(auth, input);
  const { today } = await getUserCalendar(auth.userId);
  const attributes = { ...input };
  if (recurrence) {
    Object.assign(attributes, {
      recurring: true,
      recurrence,
      seriesId: randomUUID(),
      seriesStartDate: input.dueDate,
    });
  }
  assertConsistent(attributes);
  if (attributes.status === 'done') {
    attributes.completedAt = new Date();
    attributes.completedOn = today;
  }
  const task = await taskService.create(auth, attributes, { id });
  if (task.status === 'done') await createNextOccurrence(auth, task);
  return serializeTask(task);
}

export async function getTask(auth, id) {
  return serializeTask(await taskService.getById(auth, id));
}

export async function updateTask(auth, id, { baseVersion, recurrence, status, ...patch }) {
  await assertReferences(auth, patch);
  const { today } = await getUserCalendar(auth.userId);
  let completedNow = false;

  const intendedFields = [
    ...Object.keys(patch),
    ...(recurrence !== undefined ? ['recurrence', 'recurring'] : []),
    ...(status !== undefined ? ['status'] : []),
  ];
  const { document } = await mutateTask(
    auth,
    id,
    (task) => {
      const previousDue = task.dueDate;
      assignPatch(task, patch);
      // A changed due date never erases the date the task was first due.
      if (previousDue && task.dueDate !== previousDue) task.originalDueDate ??= previousDue;
      applyRecurrence(task, recurrence);
      if (status !== undefined) {
        completedNow = status === 'done' && task.status !== 'done';
        applyStatus(task, status, today);
      }
      assertConsistent(task);
    },
    { baseVersion, intendedFields },
  );
  if (completedNow) await createNextOccurrence(auth, document);
  return serializeTask(document);
}

export async function deleteTask(auth, id) {
  await taskService.remove(auth, id);
}

/** Marks a task as done. For a recurring task this also creates its next occurrence. */
export async function completeTask(auth, id) {
  const { today } = await getUserCalendar(auth.userId);
  const { document } = await taskService.mutate(auth, id, (task) => {
    applyStatus(task, 'done', today);
  });
  const next = await createNextOccurrence(auth, document);
  return { task: serializeTask(document), next: next ? serializeTask(next) : null };
}

export async function reopenTask(auth, id) {
  const { document } = await taskService.mutate(auth, id, (task) => {
    applyStatus(task, 'todo', null);
  });
  return serializeTask(document);
}

/**
 * Moves an open task to a later day. The first due date is kept in `originalDueDate` and
 * the number of postponements is counted, so a task that keeps slipping stays visible.
 */
export async function postponeTask(auth, id, { to }) {
  const { today } = await getUserCalendar(auth.userId);
  const { document } = await mutateTask(auth, id, (task) => {
    if (!OPEN_TASK_STATUSES.includes(task.status)) {
      throw conflict(ERROR_CODES.INVALID_STATE);
    }
    const from = task.dueDate ?? today;
    if (to <= from) throw fieldError('to', 'must_be_later');
    if (task.dueDate) {
      task.originalDueDate ??= task.dueDate;
      // A time block planned for the old day moves with the task.
      if (task.scheduledDate) task.scheduledDate = addDays(task.scheduledDate, diffDays(from, to));
    }
    task.dueDate = to;
    task.postponedCount += 1;
    assertConsistent(task);
  });
  return serializeTask(document);
}

// --- Subtasks --------------------------------------------------------------------------

async function mutateSubtasks(auth, taskId, mutator) {
  const { document } = await taskService.mutate(auth, taskId, mutator, {
    intendedFields: ['subtasks'],
  });
  return serializeTask(document);
}

function findSubtask(task, subtaskId) {
  const subtask = task.subtasks.find((entry) => entry.id === subtaskId);
  if (!subtask) throw notFound();
  return subtask;
}

export function addSubtask(auth, taskId, { title }) {
  return mutateSubtasks(auth, taskId, (task) => {
    if (task.subtasks.length >= MAX_SUBTASKS) {
      throw limitExceeded({ details: { limit: MAX_SUBTASKS } });
    }
    task.subtasks.push({ title });
  });
}

export function updateSubtask(auth, taskId, subtaskId, patch) {
  return mutateSubtasks(auth, taskId, (task) => {
    const subtask = findSubtask(task, subtaskId);
    if (patch.title !== undefined) subtask.title = patch.title;
    if (patch.done !== undefined) subtask.done = patch.done;
  });
}

export function removeSubtask(auth, taskId, subtaskId) {
  return mutateSubtasks(auth, taskId, (task) => {
    findSubtask(task, subtaskId);
    task.subtasks = task.subtasks.filter((subtask) => subtask.id !== subtaskId);
  });
}

// --- Views -----------------------------------------------------------------------------

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SORTS = {
  due: { dueDate: 1, createdAt: 1 },
  created: { createdAt: -1 },
  completed: { completedAt: -1 },
  manual: { sortOrder: 1, createdAt: 1 },
};

export async function listTasks(auth, query) {
  const filter = {};
  if (query.status === 'open') filter.status = { $in: OPEN_TASK_STATUSES };
  else if (query.status !== 'all') filter.status = query.status;
  for (const field of ['categoryId', 'goalId', 'habitId', 'priority']) {
    if (query[field]) filter[field] = query[field];
  }
  if (query.dueFrom || query.dueTo) {
    filter.dueDate = {};
    if (query.dueFrom) filter.dueDate.$gte = query.dueFrom;
    if (query.dueTo) filter.dueDate.$lte = query.dueTo;
  }
  if (query.dated === 'true') filter.dueDate = { ...filter.dueDate, $ne: null };
  if (query.dated === 'false') filter.dueDate = null;
  if (query.search) filter.title = { $regex: escapeRegExp(query.search), $options: 'i' };

  const [{ items, total }, { today }] = await Promise.all([
    taskService.find(auth, filter, {
      sort: SORTS[query.sort],
      page: query.page,
      limit: query.limit,
    }),
    getUserCalendar(auth.userId),
  ]);
  return { items: items.map(serializeTask), total, today };
}

/**
 * The tasks of one day.
 *
 * - `overdue`    open tasks whose due date has passed. Listed for today only: on any other
 *                day they would be noise, on today they are what needs attention first.
 * - `due`        tasks due or scheduled on the day, open or done.
 * - `completed`  tasks finished on the day that were not due or scheduled on it.
 */
export async function getTaskDay(auth, date) {
  const { today } = await getUserCalendar(auth.userId);
  const day = date ?? today;
  const base = { userId: auth.userId, deletedAt: null };

  const [due, completed, overdue] = await Promise.all([
    Task.find({
      ...base,
      status: { $ne: 'cancelled' },
      $or: [{ dueDate: day }, { scheduledDate: day }],
    }),
    Task.find({ ...base, completedOn: day, dueDate: { $ne: day }, scheduledDate: { $ne: day } }),
    day === today
      ? Task.find({ ...base, status: { $in: OPEN_TASK_STATUSES }, dueDate: { $lt: today } })
      : [],
  ]);
  // A task scheduled today but due earlier belongs to today's plan, not to the overdue list.
  const dueIds = new Set(due.map((task) => String(task._id)));
  const reallyOverdue = overdue.filter((task) => !dueIds.has(String(task._id)));

  const open = due.filter((task) => task.status !== 'done');
  const done = [...due.filter((task) => task.status === 'done'), ...completed];
  return {
    date: day,
    today,
    overdue: reallyOverdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(serializeTask),
    due: open.sort(byUrgency).map(serializeTask),
    completed: done.sort((a, b) => b.completedAt - a.completedAt).map(serializeTask),
    summary: {
      total: open.length + done.length,
      done: done.length,
      overdue: reallyOverdue.length,
    },
  };
}
