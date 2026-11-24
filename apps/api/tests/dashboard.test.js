import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInsights } from '../src/modules/dashboard/dashboard-insights.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const day = (index, due, completed) => ({
  date: `2026-11-${String(index).padStart(2, '0')}`,
  due,
  completed,
});
const week = (start, due, completed) =>
  Array.from({ length: 7 }, (_, index) => day(start + index, due, completed));
const habitItem = (overrides = {}) => ({
  habitId: 'h1',
  state: 'pending',
  due: true,
  streak: { current: 0, best: 0, unit: 'days' },
  ...overrides,
  habit: { name: 'Read', streakGoal: null, ...overrides.habit },
});
const base = {
  thisWeek: week(18, 0, 0),
  lastWeek: week(11, 0, 0),
  habitItems: [],
  overdueTasks: 0,
  goals: [],
  upcoming: [],
  today: TODAY,
};
const kinds = (input) => buildInsights({ ...base, ...input }).map((insight) => insight.kind);

describe('dashboard insights', () => {
  it('says nothing when there is nothing to say', () => {
    expect(buildInsights(base)).toEqual([]);
  });

  it('notices when everything due today is done, ignoring excused habits', () => {
    const done = habitItem({ state: 'completed' });
    expect(kinds({ habitItems: [done, habitItem({ state: 'skipped' })] })).toContain(
      'all_habits_done',
    );
    expect(kinds({ habitItems: [done, habitItem()] })).not.toContain('all_habits_done');
    expect(kinds({ habitItems: [habitItem({ state: 'skipped' })] })).not.toContain(
      'all_habits_done',
    );
  });

  it('compares this week with last week only when both have enough data', () => {
    const [up] = buildInsights({ ...base, thisWeek: week(18, 2, 2), lastWeek: week(11, 2, 1) });
    expect(up).toEqual({
      kind: 'habit_rate_up',
      tone: 'positive',
      params: { current: 100, previous: 50, change: 50 },
    });
    expect(kinds({ thisWeek: week(18, 2, 1), lastWeek: week(11, 2, 2) })).toEqual([
      'habit_rate_down',
    ]);
    // A change below five percentage points is not worth mentioning.
    expect(kinds({ thisWeek: week(18, 10, 9), lastWeek: week(11, 10, 9) })).toEqual([]);
    // One due day last week is too little to compare with.
    expect(
      kinds({ thisWeek: week(18, 2, 2), lastWeek: [day(11, 1, 0), ...week(12, 0, 0).slice(1)] }),
    ).toEqual([]);
  });

  it('reports overdue tasks, a goal near its target date and a busy day', () => {
    const goal = (title, daysLeft) => ({ id: title, title, computed: { daysLeft, percent: 40.4 } });
    const timed = (date) => ({ allDay: false, date });
    const insights = buildInsights({
      ...base,
      overdueTasks: 3,
      goals: [goal('Later', 20), goal('Soon', 5), goal('Sooner', 2), goal('Past', -1)],
      upcoming: [
        timed('2026-11-26'),
        timed('2026-11-26'),
        timed('2026-11-26'),
        timed('2026-11-27'),
        timed(TODAY),
        { allDay: true, date: '2026-11-27' },
      ],
    });
    expect(insights).toEqual([
      { kind: 'overdue_tasks', tone: 'attention', params: { count: 3 } },
      {
        kind: 'goal_deadline',
        tone: 'attention',
        params: { goalId: 'Sooner', title: 'Sooner', days: 2, percent: 40 },
      },
      { kind: 'busy_day', tone: 'neutral', params: { date: '2026-11-26', count: 3 } },
    ]);
  });

  it('mentions a streak close to its goal and a streak of a week or more', () => {
    const insights = buildInsights({
      ...base,
      habitItems: [
        habitItem({
          habitId: 'a',
          streak: { current: 28, best: 28, unit: 'days' },
          habit: { name: 'Run', streakGoal: 30 },
        }),
        habitItem({ habitId: 'b', streak: { current: 3, best: 9, unit: 'days' } }),
      ],
    });
    expect(insights).toEqual([
      {
        kind: 'streak_goal_near',
        tone: 'positive',
        params: { habitId: 'a', name: 'Run', remaining: 2, goal: 30 },
      },
      { kind: 'long_streak', tone: 'positive', params: { habitId: 'a', name: 'Run', count: 28 } },
    ]);
  });

  it('shows at most four insights', () => {
    const insights = buildInsights({
      ...base,
      thisWeek: week(18, 2, 2),
      lastWeek: week(11, 2, 1),
      overdueTasks: 1,
      goals: [{ id: 'g', title: 'G', computed: { daysLeft: 1, percent: 10 } }],
      habitItems: [
        habitItem({
          state: 'completed',
          streak: { current: 9, best: 9, unit: 'days' },
          habit: { name: 'Read', streakGoal: 10 },
        }),
      ],
    });
    expect(insights).toHaveLength(4);
  });
});

describe('dashboard', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  it('is empty but complete for a new account', async () => {
    setNow();
    const user = await registerUser();
    const dashboard = (await user.get('/dashboard').expect(200)).body.data;
    expect(dashboard).toMatchObject({
      today: TODAY,
      timeZone: 'Europe/Istanbul',
      habits: { summary: { due: 0, completed: 0, rate: null }, items: [] },
      tasks: {
        summary: { total: 0, done: 0, overdue: 0, open: 0 },
        overdue: [],
        due: [],
        completed: [],
      },
      upcoming: [],
      goals: [],
      streaks: [],
      activity: [],
      insights: [],
    });
    expect(dashboard.week.days.map((entry) => entry.date)).toEqual([
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
    ]);
    expect(dashboard.week.habits).toEqual({ due: 0, completed: 0, rate: null, previousRate: null });
  });

  it('aggregates real data from every module', async () => {
    setNow();
    const user = await registerUser();
    const post = async (path, body) => (await user.post(path, body).expect(201)).body.data;

    const read = await post('/habits', {
      name: 'Read',
      color: '#0a84ff',
      startDate: '2026-11-10',
      streakGoal: 16,
    });
    const run = await post('/habits', { name: 'Run', color: '#30d158', startDate: '2026-11-10' });
    // Read: every day from the 10th. Run: only the last three days before today.
    for (let dayOfMonth = 10; dayOfMonth <= 24; dayOfMonth += 1) {
      await user.put(`/habits/${read.id}/entries/2026-11-${dayOfMonth}`, { value: 1 }).expect(200);
    }
    for (const date of ['2026-11-21', '2026-11-22', '2026-11-23']) {
      await user.put(`/habits/${run.id}/entries/${date}`, { value: 1 }).expect(200);
    }

    await post('/tasks', { title: 'Overdue report', dueDate: '2026-11-20' });
    await post('/tasks', { title: 'Call the bank', dueDate: TODAY, priority: 'high' });
    const done = await post('/tasks', { title: 'Buy milk', dueDate: TODAY });
    await user.post(`/tasks/${done.id}/complete`).expect(200);
    await post('/tasks', { title: 'Someday' });

    await post('/goals', { title: 'Far goal', color: '#0a84ff', targetDate: '2027-06-01' });
    const near = await post('/goals', {
      title: 'Near goal',
      color: '#0a84ff',
      targetDate: '2026-11-27',
      progress: { mode: 'manual', value: 60 },
    });
    await post('/goals', { title: 'Paused goal', color: '#0a84ff', status: 'paused' });

    await post('/calendar/events', {
      title: 'Morning meeting',
      startDate: TODAY,
      startTime: '08:00',
      endTime: '09:00',
    });
    await post('/calendar/events', {
      title: 'Afternoon review',
      startDate: TODAY,
      startTime: '15:00',
      endTime: '16:00',
    });
    await post('/calendar/events', { title: 'Trip', allDay: true, startDate: '2026-11-26' });

    const dashboard = (await user.get('/dashboard').expect(200)).body.data;

    // Habits of today.
    expect(dashboard.habits.summary).toMatchObject({ due: 2, completed: 1, rate: 0.5 });
    expect(dashboard.habits.items.map((item) => [item.habit.name, item.state])).toEqual([
      ['Read', 'completed'],
      ['Run', 'pending'],
    ]);

    // Tasks of today.
    expect(dashboard.tasks.summary).toEqual({ total: 2, done: 1, overdue: 1, open: 3 });
    expect(dashboard.tasks.overdue.map((task) => task.title)).toEqual(['Overdue report']);
    expect(dashboard.tasks.due.map((task) => task.title)).toEqual(['Call the bank']);
    expect(dashboard.tasks.completed.map((task) => task.title)).toEqual(['Buy milk']);

    // Upcoming: the meeting at 08:00 is over at noon and is not listed.
    expect(dashboard.upcoming.map((item) => item.title)).toEqual([
      'Call the bank',
      'Afternoon review',
      'Trip',
    ]);

    // Active goals, nearest target first; the paused one is not listed.
    expect(dashboard.goals.map((goal) => goal.title)).toEqual(['Near goal', 'Far goal']);

    // The last seven days: Read due and done every day, Run done on three of seven.
    expect(dashboard.week.days).toEqual([
      { date: '2026-11-18', due: 2, completed: 1, tasksCompleted: 0 },
      { date: '2026-11-19', due: 2, completed: 1, tasksCompleted: 0 },
      { date: '2026-11-20', due: 2, completed: 1, tasksCompleted: 0 },
      { date: '2026-11-21', due: 2, completed: 2, tasksCompleted: 0 },
      { date: '2026-11-22', due: 2, completed: 2, tasksCompleted: 0 },
      { date: '2026-11-23', due: 2, completed: 2, tasksCompleted: 0 },
      { date: '2026-11-24', due: 2, completed: 1, tasksCompleted: 1 },
    ]);
    expect(dashboard.week.habits).toMatchObject({ due: 14, completed: 10 });
    expect(dashboard.week.habits.rate).toBeCloseTo(10 / 14);
    // The week before (11th–17th): 14 due, Read completed 7.
    expect(dashboard.week.habits.previousRate).toBeCloseTo(0.5);
    expect(dashboard.week).toMatchObject({ tasksCompleted: 1, previousTasksCompleted: 0 });

    expect(dashboard.streaks.map((streak) => [streak.name, streak.current])).toEqual([
      ['Read', 15],
      ['Run', 3],
    ]);

    expect(dashboard.insights.map((insight) => insight.kind)).toEqual([
      'overdue_tasks',
      'goal_deadline',
      'habit_rate_up',
      'streak_goal_near',
    ]);
    expect(dashboard.insights[1].params).toMatchObject({ goalId: near.id, days: 3, percent: 60 });
    expect(dashboard.insights[3].params).toMatchObject({ name: 'Read', remaining: 1, goal: 16 });

    const activity = dashboard.activity.map((entry) => [entry.kind, entry.title]);
    expect(activity.slice(0, 4)).toEqual([
      ['event_created', 'Trip'],
      ['event_created', 'Afternoon review'],
      ['event_created', 'Morning meeting'],
      ['goal_created', 'Paused goal'],
    ]);
    expect(activity).toHaveLength(8);
    expect(dashboard.activity.every((entry) => entry.title && entry.entityId)).toBe(true);
  });

  it('reports completions in the recent activity with the habit’s name', async () => {
    setNow();
    const user = await registerUser();
    const habit = (
      await user.post('/habits', {
        name: 'Meditate',
        color: '#bf5af2',
        target: { kind: 'count', value: 2 },
      })
    ).body.data;
    await user.put(`/habits/${habit.id}/entries/${TODAY}`, { increment: 1 }).expect(200);
    await user.put(`/habits/${habit.id}/entries/${TODAY}`, { increment: 1 }).expect(200);
    await user.put(`/habits/${habit.id}/entries/${TODAY}`, { note: 'Felt calm' }).expect(200);
    const task = (await user.post('/tasks', { title: 'Send invoice' })).body.data;
    await user.post(`/tasks/${task.id}/complete`).expect(200);

    const { activity } = (await user.get('/dashboard').expect(200)).body.data;
    expect(activity.map((entry) => [entry.kind, entry.title])).toEqual([
      ['task_completed', 'Send invoice'],
      ['task_created', 'Send invoice'],
      // Reaching the target is listed once; the partial step and the later note are not.
      ['habit_completed', 'Meditate'],
      ['habit_created', 'Meditate'],
    ]);
    expect(activity[2].entityId).toBe(habit.id);
  });

  it('keeps the widget layout in the account and completes it with new widgets', async () => {
    const user = await registerUser();
    const initial = (await user.get('/settings').expect(200)).body.data.dashboard.widgets;
    expect(initial.map((widget) => widget.id)).toEqual([
      'progress',
      'quickActions',
      'habits',
      'tasks',
      'events',
      'goals',
      'week',
      'streaks',
      'insights',
      'activity',
    ]);
    expect(initial.every((widget) => widget.visible)).toBe(true);

    // The user moves tasks first and hides the activity widget, listing only what they touched.
    const saved = (
      await user
        .patch('/settings', {
          dashboard: {
            widgets: [
              { id: 'tasks', visible: true },
              { id: 'activity', visible: false },
            ],
          },
        })
        .expect(200)
    ).body.data.dashboard.widgets;
    expect(saved.slice(0, 2)).toEqual([
      { id: 'tasks', visible: true },
      { id: 'activity', visible: false },
    ]);
    // Everything else follows in the default order.
    expect(saved).toHaveLength(10);
    expect(saved[2]).toEqual({ id: 'progress', visible: true });

    await user
      .patch('/settings', { dashboard: { widgets: [{ id: 'weather', visible: true }] } })
      .expect(400);
    const duplicate = await user
      .patch('/settings', {
        dashboard: {
          widgets: [
            { id: 'tasks', visible: true },
            { id: 'tasks', visible: false },
          ],
        },
      })
      .expect(400);
    expect(duplicate.body.error.details[0].code).toBe('duplicate_value');
  });

  it('shows each user only their own dashboard', async () => {
    setNow();
    const alice = await registerUser();
    const bob = await registerUser();
    await alice.post('/tasks', { title: 'Private task', dueDate: TODAY }).expect(201);
    await alice.post('/habits', { name: 'Private habit', color: '#0a84ff' }).expect(201);

    const dashboard = (await bob.get('/dashboard').expect(200)).body.data;
    expect(dashboard.tasks.due).toEqual([]);
    expect(dashboard.habits.items).toEqual([]);
    expect(dashboard.activity).toEqual([]);
  });
});
