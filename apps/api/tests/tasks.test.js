import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Task } from '../src/modules/tasks/task.model.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const create = async (user, body) =>
  (await user.post('/tasks', { title: 'Write report', ...body }).expect(201)).body.data;
const titles = (list) => list.map((task) => task.title);

describe('tasks', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  describe('management', () => {
    it('creates a task with defaults', async () => {
      const user = await registerUser();
      const task = await create(user, { title: '  Buy milk ' });
      expect(task).toMatchObject({
        title: 'Buy milk',
        version: 1,
        priority: 'none',
        status: 'todo',
        dueDate: null,
        subtasks: [],
        recurrence: null,
        seriesId: null,
        postponedCount: 0,
        completedAt: null,
      });
    });

    it('stores dates, a time block, subtasks and a client-generated id', async () => {
      const user = await registerUser();
      const id = randomUUID();
      const task = await create(user, {
        id,
        priority: 'high',
        startDate: '2026-11-20',
        dueDate: '2026-11-27',
        dueTime: '17:00',
        scheduledDate: '2026-11-26',
        scheduledTime: '10:00',
        durationMinutes: 90,
        subtasks: [{ title: 'Outline' }, { title: 'Draft' }],
      });
      expect(task).toMatchObject({
        id,
        priority: 'high',
        dueDate: '2026-11-27',
        dueTime: '17:00',
        scheduledDate: '2026-11-26',
        durationMinutes: 90,
      });
      expect(task.subtasks.map((subtask) => [subtask.title, subtask.done])).toEqual([
        ['Outline', false],
        ['Draft', false],
      ]);
      await user.post('/tasks', { id, title: 'Again' }).expect(409);
    });

    it('rejects inconsistent tasks with field errors', async () => {
      const user = await registerUser();
      const cases = [
        [{ title: '' }, 'title'],
        [{ title: 'x', priority: 'critical' }, 'priority'],
        [{ title: 'x', startDate: '2026-11-20', dueDate: '2026-11-10' }, 'dueDate'],
        [{ title: 'x', dueTime: '09:00' }, 'dueDate'],
        [{ title: 'x', scheduledTime: '09:00' }, 'scheduledDate'],
        [{ title: 'x', durationMinutes: 2, scheduledDate: TODAY }, 'durationMinutes'],
        [{ title: 'x', recurrence: { frequency: 'daily' } }, 'dueDate'],
        [
          {
            title: 'x',
            dueDate: '2026-11-20',
            recurrence: { frequency: 'daily' },
            recurrenceEndDate: '2026-11-01',
          },
          'recurrenceEndDate',
        ],
        [{ title: 'x', goalId: randomUUID() }, 'goalId'],
        [{ title: 'x', habitId: randomUUID() }, 'habitId'],
        [{ title: 'x', subtasks: [{ title: '' }] }, 'subtasks.0.title'],
      ];
      for (const [body, path] of cases) {
        const response = await user.post('/tasks', body);
        expect(response.status, path).toBe(400);
        expect(response.body.error.details.map((detail) => detail.path)).toContain(path);
      }
    });

    it('lists with filters, search, sorting and pagination', async () => {
      setNow();
      const user = await registerUser();
      await create(user, { title: 'Pay rent', dueDate: '2026-11-28', priority: 'high' });
      await create(user, { title: 'Call the bank', dueDate: '2026-11-25' });
      await create(user, { title: 'Someday: learn piano' });
      const done = await create(user, { title: 'Pay taxes', dueDate: '2026-11-20' });
      await user.post(`/tasks/${done.id}/complete`).expect(200);

      const list = async (query) => (await user.get(`/tasks${query}`).expect(200)).body;
      const open = await list('');
      expect(titles(open.data)).toEqual(['Someday: learn piano', 'Call the bank', 'Pay rent']);
      expect(open.meta).toMatchObject({ total: 3, today: TODAY });

      expect(titles((await list('?status=done')).data)).toEqual(['Pay taxes']);
      expect(titles((await list('?priority=high')).data)).toEqual(['Pay rent']);
      expect(titles((await list('?dated=false')).data)).toEqual(['Someday: learn piano']);
      expect(titles((await list('?dueFrom=2026-11-26&dueTo=2026-11-30')).data)).toEqual([
        'Pay rent',
      ]);
      expect(titles((await list('?status=all&search=PAY')).data).sort()).toEqual([
        'Pay rent',
        'Pay taxes',
      ]);
      // Search text is matched literally, not as a pattern.
      expect((await list('?status=all&search=.*')).data).toEqual([]);

      const page = await list('?limit=2&page=2');
      expect(page.data).toHaveLength(1);
      expect(page.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    });
  });

  describe('completion', () => {
    it('completes and reopens a task, recording the user’s calendar date', async () => {
      // 21:30 UTC on the 24th is already the 25th in Istanbul.
      setNow('2026-11-24T21:30:00.000Z');
      const user = await registerUser({ timeZone: 'Europe/Istanbul' });
      const task = await create(user);

      const completed = (await user.post(`/tasks/${task.id}/complete`).expect(200)).body.data;
      expect(completed.task).toMatchObject({
        status: 'done',
        completedAt: '2026-11-24T21:30:00.000Z',
        completedOn: '2026-11-25',
      });
      expect(completed.next).toBeNull();

      const reopened = (await user.post(`/tasks/${task.id}/reopen`).expect(200)).body.data;
      expect(reopened).toMatchObject({ status: 'todo', completedAt: null, completedOn: null });
    });

    it('accepts status changes through an update as well', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user);
      const started = (await user.patch(`/tasks/${task.id}`, { status: 'in_progress' })).body.data;
      expect(started.status).toBe('in_progress');
      const done = (await user.patch(`/tasks/${task.id}`, { status: 'done' })).body.data;
      expect(done).toMatchObject({ status: 'done', completedOn: TODAY });
    });
  });

  describe('recurring tasks', () => {
    it('creates the next occurrence when one is completed', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user, {
        title: 'Water the plants',
        dueDate: '2026-11-23',
        dueTime: '09:00',
        scheduledDate: '2026-11-23',
        scheduledTime: '08:30',
        durationMinutes: 15,
        priority: 'low',
        subtasks: [{ title: 'Balcony' }, { title: 'Kitchen' }],
        recurrence: { frequency: 'weekly', weekdays: [1, 4] },
      });
      expect(task.seriesId).toEqual(expect.any(String));
      await user.patch(`/tasks/${task.id}/subtasks/${task.subtasks[0].id}`, { done: true });

      const { task: completed, next } = (await user.post(`/tasks/${task.id}/complete`).expect(200))
        .body.data;
      expect(completed.status).toBe('done');
      // Monday the 23rd is followed by Thursday the 26th.
      expect(next).toMatchObject({
        title: 'Water the plants',
        status: 'todo',
        dueDate: '2026-11-26',
        dueTime: '09:00',
        scheduledDate: '2026-11-26',
        scheduledTime: '08:30',
        durationMinutes: 15,
        priority: 'low',
        seriesId: task.seriesId,
        recurrence: { frequency: 'weekly', weekdays: [1, 4] },
      });
      expect(next.id).not.toBe(task.id);
      // The new occurrence starts with a fresh checklist.
      expect(next.subtasks.map((subtask) => [subtask.title, subtask.done])).toEqual([
        ['Balcony', false],
        ['Kitchen', false],
      ]);

      const after = (await user.post(`/tasks/${next.id}/complete`).expect(200)).body.data.next;
      expect(after.dueDate).toBe('2026-11-30');
    });

    it('never duplicates the next occurrence', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user, { dueDate: TODAY, recurrence: { frequency: 'daily' } });

      const first = (await user.post(`/tasks/${task.id}/complete`).expect(200)).body.data;
      expect(first.next.dueDate).toBe('2026-11-25');
      await user.post(`/tasks/${task.id}/reopen`).expect(200);
      const again = (await user.post(`/tasks/${task.id}/complete`).expect(200)).body.data;
      expect(again.next).toBeNull();

      // Two devices completing at the same moment do not create two either.
      const other = await create(user, { dueDate: TODAY, recurrence: { frequency: 'daily' } });
      await Promise.all([
        user.post(`/tasks/${other.id}/complete`),
        user.patch(`/tasks/${other.id}`, { status: 'done' }),
      ]);
      for (const seriesId of [task.seriesId, other.seriesId]) {
        expect(await Task.countDocuments({ seriesId, deletedAt: null })).toBe(2);
      }
    });

    it('stops at the end date and when the recurrence is removed', async () => {
      setNow();
      const user = await registerUser();
      const ending = await create(user, {
        dueDate: TODAY,
        recurrence: { frequency: 'daily' },
        recurrenceEndDate: TODAY,
      });
      expect((await user.post(`/tasks/${ending.id}/complete`)).body.data.next).toBeNull();

      const cleared = await create(user, { dueDate: TODAY, recurrence: { frequency: 'daily' } });
      const updated = (await user.patch(`/tasks/${cleared.id}`, { recurrence: null })).body.data;
      expect(updated).toMatchObject({ recurrence: null, seriesId: null });
      expect((await user.post(`/tasks/${cleared.id}/complete`)).body.data.next).toBeNull();
    });

    it('turns an ordinary task into a repeating one', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user, { dueDate: '2026-11-30' });
      await user.patch(`/tasks/${task.id}`, { recurrence: { frequency: 'monthly' } }).expect(200);
      const next = (await user.post(`/tasks/${task.id}/complete`)).body.data.next;
      expect(next.dueDate).toBe('2026-12-30');
      // A task without a due date cannot repeat.
      const undated = await create(user);
      await user.patch(`/tasks/${undated.id}`, { recurrence: { frequency: 'daily' } }).expect(400);
    });
  });

  describe('postponing', () => {
    it('moves a task and remembers the first due date', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user, {
        dueDate: '2026-11-20',
        scheduledDate: '2026-11-20',
        scheduledTime: '14:00',
      });

      const first = (await user.post(`/tasks/${task.id}/postpone`, { to: TODAY }).expect(200)).body
        .data;
      expect(first).toMatchObject({
        dueDate: TODAY,
        scheduledDate: TODAY,
        originalDueDate: '2026-11-20',
        postponedCount: 1,
      });
      const second = (
        await user.post(`/tasks/${task.id}/postpone`, { to: '2026-11-27' }).expect(200)
      ).body.data;
      expect(second).toMatchObject({
        dueDate: '2026-11-27',
        originalDueDate: '2026-11-20',
        postponedCount: 2,
      });

      await user.post(`/tasks/${task.id}/postpone`, { to: '2026-11-27' }).expect(400);
      await user.post(`/tasks/${task.id}/complete`).expect(200);
      const closed = await user
        .post(`/tasks/${task.id}/postpone`, { to: '2026-12-01' })
        .expect(409);
      expect(closed.body.error.code).toBe('INVALID_STATE');
    });

    it('keeps the first due date when the date is edited directly', async () => {
      const user = await registerUser();
      const task = await create(user, { dueDate: '2026-11-20' });
      const moved = (await user.patch(`/tasks/${task.id}`, { dueDate: '2026-12-05' })).body.data;
      expect(moved).toMatchObject({ dueDate: '2026-12-05', originalDueDate: '2026-11-20' });
      const cleared = (await user.patch(`/tasks/${task.id}`, { dueDate: null })).body.data;
      expect(cleared).toMatchObject({ dueDate: null, originalDueDate: '2026-11-20' });
    });

    it('gives an undated task a date', async () => {
      setNow();
      const user = await registerUser();
      const task = await create(user);
      await user.post(`/tasks/${task.id}/postpone`, { to: TODAY }).expect(400);
      const moved = (
        await user.post(`/tasks/${task.id}/postpone`, { to: '2026-11-25' }).expect(200)
      ).body.data;
      expect(moved).toMatchObject({ dueDate: '2026-11-25', originalDueDate: null });
    });
  });

  describe('subtasks', () => {
    it('adds, ticks, renames and removes subtasks', async () => {
      const user = await registerUser();
      const task = await create(user);
      await user.post(`/tasks/${task.id}/subtasks`, { title: 'Research' }).expect(201);
      let current = (await user.post(`/tasks/${task.id}/subtasks`, { title: 'Write' }).expect(201))
        .body.data;
      const [research, write] = current.subtasks;

      await user.patch(`/tasks/${task.id}/subtasks/${research.id}`, { done: true }).expect(200);
      current = (
        await user
          .patch(`/tasks/${task.id}/subtasks/${write.id}`, { title: 'Write the draft' })
          .expect(200)
      ).body.data;
      expect(current.subtasks.map((subtask) => [subtask.title, subtask.done])).toEqual([
        ['Research', true],
        ['Write the draft', false],
      ]);

      current = (await user.delete(`/tasks/${task.id}/subtasks/${research.id}`).expect(200)).body
        .data;
      expect(current.subtasks).toHaveLength(1);
      await user.delete(`/tasks/${task.id}/subtasks/${research.id}`).expect(404);
      await user.post(`/tasks/${task.id}/subtasks`, { title: ' ' }).expect(400);
    });
  });

  describe('the day view', () => {
    it('separates overdue, due and completed tasks of the user’s today', async () => {
      setNow();
      const user = await registerUser();
      await create(user, { title: 'Overdue', dueDate: '2026-11-20' });
      await create(user, { title: 'Due low', dueDate: TODAY, priority: 'low' });
      await create(user, { title: 'Due high', dueDate: TODAY, priority: 'high' });
      await create(user, { title: 'Timed', dueDate: TODAY, priority: 'high', dueTime: '08:00' });
      await create(user, { title: 'Planned block', dueDate: '2026-11-30', scheduledDate: TODAY });
      await create(user, {
        title: 'Late but planned today',
        dueDate: '2026-11-22',
        scheduledDate: TODAY,
      });
      await create(user, { title: 'Tomorrow', dueDate: '2026-11-25' });
      const cancelled = await create(user, { title: 'Cancelled', dueDate: TODAY });
      await user.patch(`/tasks/${cancelled.id}`, { status: 'cancelled' });
      const finished = await create(user, { title: 'Finished today', dueDate: TODAY });
      await user.post(`/tasks/${finished.id}/complete`);
      const early = await create(user, { title: 'Done early', dueDate: '2026-11-30' });
      await user.post(`/tasks/${early.id}/complete`);

      const day = (await user.get('/tasks/day').expect(200)).body.data;
      expect(day).toMatchObject({ date: TODAY, today: TODAY });
      expect(titles(day.overdue)).toEqual(['Overdue']);
      // Ordered by priority, then by time of day; ties fall back to creation and title.
      expect(titles(day.due)).toEqual([
        'Timed',
        'Due high',
        'Due low',
        'Late but planned today',
        'Planned block',
      ]);
      expect(titles(day.completed).sort()).toEqual(['Done early', 'Finished today']);
      expect(day.summary).toEqual({ total: 7, done: 2, overdue: 1 });
    });

    it('shows other days without the overdue list', async () => {
      setNow();
      const user = await registerUser();
      await create(user, { title: 'Overdue', dueDate: '2026-11-20' });
      await create(user, { title: 'Tomorrow', dueDate: '2026-11-25' });
      const day = (await user.get('/tasks/day?date=2026-11-25').expect(200)).body.data;
      expect(titles(day.due)).toEqual(['Tomorrow']);
      expect(day.overdue).toEqual([]);
    });

    it('decides what is overdue from the user’s time zone', async () => {
      // 21:30 UTC on the 24th: the 25th has begun in Istanbul but not in New York.
      setNow('2026-11-24T21:30:00.000Z');
      const istanbul = await registerUser({ timeZone: 'Europe/Istanbul' });
      const newYork = await registerUser({ timeZone: 'America/New_York' });
      await create(istanbul, { title: 'Due on the 24th', dueDate: '2026-11-24' });
      await create(newYork, { title: 'Due on the 24th', dueDate: '2026-11-24' });

      const east = (await istanbul.get('/tasks/day').expect(200)).body.data;
      const west = (await newYork.get('/tasks/day').expect(200)).body.data;
      expect(titles(east.overdue)).toEqual(['Due on the 24th']);
      expect(west.overdue).toEqual([]);
      expect(titles(west.due)).toEqual(['Due on the 24th']);
    });
  });

  describe('links and ownership', () => {
    it('unlinks tasks when their category, goal or habit is deleted', async () => {
      const user = await registerUser();
      const category = (await user.post('/categories', { name: 'Work', color: '#0a84ff' })).body
        .data;
      const goal = (await user.post('/goals', { title: 'Ship it', color: '#0a84ff' })).body.data;
      const habit = (await user.post('/habits', { name: 'Deep work', color: '#0a84ff' })).body.data;
      const task = await create(user, {
        categoryId: category.id,
        goalId: goal.id,
        habitId: habit.id,
      });

      await user.delete(`/categories/${category.id}`).expect(204);
      await user.delete(`/goals/${goal.id}`).expect(204);
      await user.delete(`/habits/${habit.id}`).expect(204);

      const after = (await user.get(`/tasks/${task.id}`).expect(200)).body.data;
      expect(after).toMatchObject({ categoryId: null, goalId: null, habitId: null, version: 4 });
    });

    it('never exposes or changes another user’s tasks', async () => {
      const alice = await registerUser();
      const bob = await registerUser();
      const task = await create(alice, { title: 'Private task', subtasks: [{ title: 'Step' }] });

      expect((await bob.get('/tasks?status=all').expect(200)).body.data).toEqual([]);
      expect((await bob.get('/tasks/day').expect(200)).body.data.due).toEqual([]);
      await bob.get(`/tasks/${task.id}`).expect(404);
      await bob.patch(`/tasks/${task.id}`, { title: 'Taken' }).expect(404);
      await bob.delete(`/tasks/${task.id}`).expect(404);
      await bob.post(`/tasks/${task.id}/complete`).expect(404);
      await bob.post(`/tasks/${task.id}/reopen`).expect(404);
      await bob.post(`/tasks/${task.id}/postpone`, { to: '2027-01-01' }).expect(404);
      await bob.post(`/tasks/${task.id}/subtasks`, { title: 'Injected' }).expect(404);
      await bob
        .patch(`/tasks/${task.id}/subtasks/${task.subtasks[0].id}`, { done: true })
        .expect(404);

      const untouched = (await alice.get(`/tasks/${task.id}`).expect(200)).body.data;
      expect(untouched).toMatchObject({ title: 'Private task', status: 'todo', version: 1 });
    });

    it('includes goals and tasks in the data export', async () => {
      const user = await registerUser();
      await user.post('/goals', { title: 'Exported goal', color: '#0a84ff' }).expect(201);
      await create(user, { title: 'Exported task' });
      const exported = (await user.get('/account/export').expect(200)).body.data.data;
      expect(exported.goal.map((goal) => goal.title)).toEqual(['Exported goal']);
      expect(exported.task.map((task) => task.title)).toEqual(['Exported task']);
    });
  });
});
