import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { goalPercent } from '../src/modules/goals/goals.service.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z';
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

async function createGoal(user, overrides = {}) {
  const response = await user
    .post('/goals', { title: 'Run a marathon', color: '#30d158', ...overrides })
    .expect(201);
  return response.body.data;
}

const createTask = async (user, body) => (await user.post('/tasks', body).expect(201)).body.data;

describe('goal progress', () => {
  const goal = (progress, milestones = []) => ({
    progress: { mode: 'manual', value: 0, current: 0, target: 100, ...progress },
    milestones,
  });

  it('follows the progress mode', () => {
    expect(goalPercent(goal({ mode: 'manual', value: 42.25 }))).toBe(42.3);
    expect(goalPercent(goal({ mode: 'metric', current: 2500, target: 10000 }))).toBe(25);
    expect(goalPercent(goal({ mode: 'metric', current: 15000, target: 10000 }))).toBe(100);
    expect(
      goalPercent(goal({ mode: 'milestones' }, [{ done: true }, { done: false }, { done: true }])),
    ).toBe(66.7);
    expect(goalPercent(goal({ mode: 'tasks' }), { total: 8, done: 2 })).toBe(25);
  });

  it('is zero when there is nothing to measure yet', () => {
    expect(goalPercent(goal({ mode: 'milestones' }))).toBe(0);
    expect(goalPercent(goal({ mode: 'tasks' }), { total: 0, done: 0 })).toBe(0);
  });
});

describe('goals', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  it('creates a goal with defaults and derived figures', async () => {
    setNow();
    const user = await registerUser();
    const goal = await createGoal(user, { targetDate: '2026-12-24' });
    expect(goal).toMatchObject({
      title: 'Run a marathon',
      version: 1,
      icon: 'target',
      horizon: 'short',
      status: 'active',
      startDate: TODAY,
      targetDate: '2026-12-24',
      progress: { mode: 'manual', value: 0 },
      milestones: [],
      reviews: [],
      habitIds: [],
      parentGoalId: null,
      computed: {
        percent: 0,
        milestones: { total: 0, done: 0 },
        tasks: { total: 0, done: 0, open: 0 },
        daysLeft: 30,
        overdue: false,
      },
    });
  });

  it('validates input and references', async () => {
    setNow();
    const user = await registerUser();
    const cases = [
      [{ title: '', color: '#30d158' }, 'title'],
      [
        { title: 'x', color: '#30d158', startDate: '2026-12-01', targetDate: '2026-11-01' },
        'targetDate',
      ],
      [
        { title: 'x', color: '#30d158', progress: { mode: 'manual', value: 150 } },
        'progress.value',
      ],
      [
        { title: 'x', color: '#30d158', progress: { mode: 'metric', target: 0 } },
        'progress.target',
      ],
      [{ title: 'x', color: '#30d158', habitIds: [randomUUID()] }, 'habitIds'],
      [{ title: 'x', color: '#30d158', parentGoalId: randomUUID() }, 'parentGoalId'],
      [{ title: 'x', color: '#30d158', categoryId: randomUUID() }, 'categoryId'],
      [{ title: 'x', color: '#30d158', horizon: 'eternal' }, 'horizon'],
    ];
    for (const [body, path] of cases) {
      const response = await user.post('/goals', body);
      expect(response.status, path).toBe(400);
      expect(response.body.error.details.map((detail) => detail.path)).toContain(path);
    }
  });

  it('updates progress, completes and reopens a goal', async () => {
    setNow();
    const user = await registerUser();
    const goal = await createGoal(user, {
      progress: { mode: 'metric', target: 10000, unit: 'TL' },
    });

    const saved = (
      await user.patch(`/goals/${goal.id}`, { progress: { current: 2500 }, baseVersion: 1 })
    ).body.data;
    expect(saved.progress).toMatchObject({
      mode: 'metric',
      current: 2500,
      target: 10000,
      unit: 'TL',
    });
    expect(saved.computed.percent).toBe(25);

    const completed = (await user.patch(`/goals/${goal.id}`, { status: 'completed' })).body.data;
    expect(completed).toMatchObject({ status: 'completed', completedAt: NOON });

    const reopened = (await user.patch(`/goals/${goal.id}`, { status: 'active' })).body.data;
    expect(reopened).toMatchObject({ status: 'active', completedAt: null });
  });

  it('filters by status and marks goals past their target date as overdue', async () => {
    setNow();
    const user = await registerUser();
    await createGoal(user, { title: 'Late', startDate: '2026-10-01', targetDate: '2026-11-20' });
    await createGoal(user, { title: 'Paused', status: 'paused' });
    await createGoal(user, { title: 'Done', status: 'completed', horizon: 'long' });

    const titles = async (query) =>
      (await user.get(`/goals${query}`).expect(200)).body.data.map((goal) => goal.title).sort();
    expect(await titles('')).toEqual(['Late', 'Paused']);
    expect(await titles('?status=completed')).toEqual(['Done']);
    expect(await titles('?status=all')).toEqual(['Done', 'Late', 'Paused']);
    expect(await titles('?status=all&horizon=long')).toEqual(['Done']);

    const late = (await user.get('/goals').expect(200)).body.data.find((g) => g.title === 'Late');
    expect(late.computed).toMatchObject({ daysLeft: -4, overdue: true });
  });

  describe('milestones', () => {
    it('adds, completes, edits and removes milestones and derives progress from them', async () => {
      setNow();
      const user = await registerUser();
      const goal = await createGoal(user, { progress: { mode: 'milestones' } });

      await user
        .post(`/goals/${goal.id}/milestones`, { title: 'Run 10 km', targetDate: '2026-12-01' })
        .expect(201);
      let view = (
        await user.post(`/goals/${goal.id}/milestones`, { title: 'Run 21 km' }).expect(201)
      ).body.data;
      expect(view.milestones.map((milestone) => milestone.title)).toEqual([
        'Run 10 km',
        'Run 21 km',
      ]);
      expect(view.computed).toMatchObject({ percent: 0, milestones: { total: 2, done: 0 } });

      const [first, second] = view.milestones;
      view = (
        await user.patch(`/goals/${goal.id}/milestones/${first.id}`, { done: true }).expect(200)
      ).body.data;
      expect(view.milestones[0]).toMatchObject({ done: true, completedAt: NOON });
      expect(view.computed.percent).toBe(50);

      view = (
        await user
          .patch(`/goals/${goal.id}/milestones/${second.id}`, { title: 'Half marathon' })
          .expect(200)
      ).body.data;
      expect(view.milestones[1].title).toBe('Half marathon');

      view = (await user.delete(`/goals/${goal.id}/milestones/${second.id}`).expect(200)).body.data;
      expect(view.computed).toMatchObject({ percent: 100, milestones: { total: 1, done: 1 } });

      await user.patch(`/goals/${goal.id}/milestones/${randomUUID()}`, { done: true }).expect(404);
    });

    it('lets two devices tick different milestones without conflict', async () => {
      const user = await registerUser();
      const goal = await createGoal(user);
      const a = (await user.post(`/goals/${goal.id}/milestones`, { title: 'A' })).body.data;
      const b = (await user.post(`/goals/${goal.id}/milestones`, { title: 'B' })).body.data;
      const [first, second] = b.milestones;

      await Promise.all([
        user.patch(`/goals/${goal.id}/milestones/${first.id}`, { done: true }),
        user.patch(`/goals/${goal.id}/milestones/${second.id}`, { done: true }),
      ]);
      const detail = (await user.get(`/goals/${goal.id}`).expect(200)).body.data.goal;
      expect(detail.milestones.map((milestone) => milestone.done)).toEqual([true, true]);
      expect(a.milestones).toHaveLength(1);
    });
  });

  describe('links', () => {
    it('derives progress from linked tasks and ignores cancelled ones', async () => {
      const user = await registerUser();
      const goal = await createGoal(user, { progress: { mode: 'tasks' } });
      const tasks = [];
      for (const title of ['One', 'Two', 'Three', 'Dropped']) {
        tasks.push(await createTask(user, { title, goalId: goal.id }));
      }
      await user.post(`/tasks/${tasks[0].id}/complete`).expect(200);
      await user.patch(`/tasks/${tasks[3].id}`, { status: 'cancelled' }).expect(200);

      const view = (await user.get(`/goals/${goal.id}`).expect(200)).body.data.goal;
      expect(view.computed.tasks).toEqual({ total: 3, done: 1, open: 2 });
      expect(view.computed.percent).toBe(33.3);

      const linked = await user.get(`/tasks?goalId=${goal.id}&status=all`).expect(200);
      expect(linked.body.data).toHaveLength(4);
    });

    it('links habits and shows them in the detail', async () => {
      const user = await registerUser();
      const habit = (await user.post('/habits', { name: 'Morning run', color: '#30d158' })).body
        .data;
      const goal = await createGoal(user, { habitIds: [habit.id] });
      const detail = (await user.get(`/goals/${goal.id}`).expect(200)).body.data;
      expect(detail.habits).toEqual([
        { id: habit.id, name: 'Morning run', color: '#30d158', icon: 'star', archived: false },
      ]);

      // Deleting the habit removes the link, as a versioned change of the goal.
      await user.delete(`/habits/${habit.id}`).expect(204);
      const after = (await user.get(`/goals/${goal.id}`).expect(200)).body.data;
      expect(after.habits).toEqual([]);
      expect(after.goal).toMatchObject({ habitIds: [], version: 2 });
    });

    it('nests sub-goals, refuses cycles and limits the depth', async () => {
      const user = await registerUser();
      const top = await createGoal(user, { title: 'Top' });
      const middle = await createGoal(user, { title: 'Middle', parentGoalId: top.id });
      const leaf = await createGoal(user, { title: 'Leaf', parentGoalId: middle.id });

      const detail = (await user.get(`/goals/${top.id}`).expect(200)).body.data;
      expect(detail.subGoals.map((goal) => goal.title)).toEqual(['Middle']);
      const topLevel = (await user.get('/goals?parentGoalId=none').expect(200)).body.data;
      expect(topLevel.map((goal) => goal.title)).toEqual(['Top']);

      // A goal cannot be its own parent or the child of its own descendant.
      await user.patch(`/goals/${top.id}`, { parentGoalId: top.id }).expect(400);
      const cycle = await user.patch(`/goals/${top.id}`, { parentGoalId: leaf.id }).expect(400);
      expect(cycle.body.error.details[0].path).toBe('parentGoalId');

      const tooDeep = await user
        .post('/goals', { title: 'Deeper', color: '#30d158', parentGoalId: leaf.id })
        .expect(400);
      expect(tooDeep.body.error.details[0].code).toBe('too_deep');
    });

    it('keeps sub-goals and tasks when a goal is deleted, without their link', async () => {
      const user = await registerUser();
      const parent = await createGoal(user, { title: 'Parent' });
      const child = await createGoal(user, { title: 'Child', parentGoalId: parent.id });
      const task = await createTask(user, { title: 'Linked', goalId: parent.id });

      await user.delete(`/goals/${parent.id}`).expect(204);
      await user.get(`/goals/${parent.id}`).expect(404);
      expect((await user.get(`/goals/${child.id}`)).body.data.goal.parentGoalId).toBeNull();
      expect((await user.get(`/tasks/${task.id}`)).body.data.goalId).toBeNull();
    });
  });

  describe('reviews and history', () => {
    it('records a review with the progress at that moment', async () => {
      setNow();
      const user = await registerUser();
      const goal = await createGoal(user, { progress: { mode: 'manual', value: 40 } });

      await user.post(`/goals/${goal.id}/reviews`, { note: '' }).expect(400);
      const reviewed = (
        await user
          .post(`/goals/${goal.id}/reviews`, { note: 'Good pace so far.', rating: 4 })
          .expect(201)
      ).body.data;
      expect(reviewed.reviews).toMatchObject([
        { date: TODAY, note: 'Good pace so far.', rating: 4, percent: 40 },
      ]);

      await user.patch(`/goals/${goal.id}`, { progress: { value: 70 } }).expect(200);
      const second = (
        await user.post(`/goals/${goal.id}/reviews`, { note: 'Faster than planned.' }).expect(201)
      ).body.data;
      expect(second.reviews.map((review) => review.percent)).toEqual([40, 70]);

      const removed = (
        await user.delete(`/goals/${goal.id}/reviews/${second.reviews[0].id}`).expect(200)
      ).body.data;
      expect(removed.reviews).toHaveLength(1);
    });

    it('lists the changes of a goal, newest first', async () => {
      const user = await registerUser();
      const goal = await createGoal(user);
      await user.patch(`/goals/${goal.id}`, { title: 'Run two marathons' }).expect(200);
      await user.patch(`/goals/${goal.id}`, { status: 'paused' }).expect(200);

      const history = (await user.get(`/goals/${goal.id}/history`).expect(200)).body.data;
      expect(history.map((entry) => [entry.event, entry.version, entry.changedFields])).toEqual([
        ['goal.updated', 3, ['status']],
        ['goal.updated', 2, ['title']],
        ['goal.created', 1, []],
      ]);
      expect(history[0].status).toBe('paused');
    });
  });

  it('never exposes or changes another user’s goals', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const goal = await createGoal(alice, { title: 'Private goal' });
    const milestone = (await alice.post(`/goals/${goal.id}/milestones`, { title: 'Step' })).body
      .data.milestones[0];

    expect((await bob.get('/goals?status=all').expect(200)).body.data).toEqual([]);
    await bob.get(`/goals/${goal.id}`).expect(404);
    await bob.patch(`/goals/${goal.id}`, { title: 'Taken' }).expect(404);
    await bob.delete(`/goals/${goal.id}`).expect(404);
    await bob.get(`/goals/${goal.id}/history`).expect(404);
    await bob.post(`/goals/${goal.id}/milestones`, { title: 'Mine now' }).expect(404);
    await bob.patch(`/goals/${goal.id}/milestones/${milestone.id}`, { done: true }).expect(404);
    await bob.post(`/goals/${goal.id}/reviews`, { note: 'Snooping' }).expect(404);
    // Bob cannot attach his own items to Alice's goal either.
    await bob
      .post('/goals', { title: 'Child', color: '#30d158', parentGoalId: goal.id })
      .expect(400);
    await bob.post('/tasks', { title: 'Sneaky', goalId: goal.id }).expect(400);

    const untouched = (await alice.get(`/goals/${goal.id}`).expect(200)).body.data.goal;
    expect(untouched).toMatchObject({ title: 'Private goal', version: 2 });
    expect(untouched.milestones[0].done).toBe(false);
  });
});
