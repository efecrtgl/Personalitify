import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHighlights } from '../src/modules/analytics/analytics-highlights.js';
import {
  bucketsOf,
  periodRange,
  previousRange,
} from '../src/modules/analytics/analytics-periods.js';
import { registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const NOON = '2026-11-24T09:00:00.000Z'; // Tuesday, 12:00 in Istanbul
const TODAY = '2026-11-24';

function setNow(iso = NOON) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
const noonOn = (date) => `${date}T09:00:00.000Z`;

describe('analytics periods', () => {
  it('finds the whole period around a date', () => {
    expect(periodRange('week', '2026-11-24', 1)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(periodRange('week', '2026-11-24', 7)).toEqual({ from: '2026-11-22', to: '2026-11-28' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('quarter', '2026-11-24')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('quarter', '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(periodRange('year', '2026-11-24')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('steps back one period of the same kind, across year ends', () => {
    const january = periodRange('month', '2027-01-15');
    expect(previousRange('month', january)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    const firstQuarter = periodRange('quarter', '2027-02-01');
    expect(previousRange('quarter', firstQuarter)).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    const week = periodRange('week', '2027-01-01', 1);
    expect(previousRange('week', week, 1)).toEqual({ from: '2026-12-21', to: '2026-12-27' });
    expect(previousRange('year', periodRange('year', '2027-06-01'))).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('cuts a period into steps that cover every day exactly once', () => {
    const month = periodRange('month', '2026-11-24');
    expect(bucketsOf('month', month)).toHaveLength(30);

    const quarter = periodRange('quarter', '2026-11-24');
    const weeks = bucketsOf('quarter', quarter, 1);
    // 1 October 2026 is a Thursday: the first week is cut at the start of the quarter.
    expect(weeks[0]).toEqual({ from: '2026-10-01', to: '2026-10-04' });
    expect(weeks[1]).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weeks.at(-1)).toEqual({ from: '2026-12-28', to: '2026-12-31' });
    for (let index = 1; index < weeks.length; index += 1) {
      const dayAfter = new Date(Date.parse(weeks[index - 1].to) + 86_400_000);
      expect(weeks[index].from).toBe(dayAfter.toISOString().slice(0, 10));
    }

    const months = bucketsOf('year', periodRange('year', '2028-05-05'));
    expect(months).toHaveLength(12);
    expect(months[1]).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('analytics highlights', () => {
  const quiet = {
    period: 'month',
    complete: true,
    habits: { due: 0, rate: null, previous: { due: 0, rate: null } },
    byWeekday: [],
    perHabit: [],
    tasks: { completed: 0, onTime: 0, late: 0, previous: { completed: 0 } },
    days: [],
    goals: { completed: 0, milestonesCompleted: 0 },
  };
  const kinds = (input) => buildHighlights({ ...quiet, ...input }).map((item) => item.kind);

  it('says nothing about an empty period', () => {
    expect(buildHighlights(quiet)).toEqual([]);
  });

  it('compares completion rates only when both periods hold enough due days', () => {
    const habits = (due, rate, previousDue, previousRate) => ({
      habits: { due, rate, previous: { due: previousDue, rate: previousRate } },
    });
    expect(buildHighlights({ ...quiet, ...habits(20, 0.9, 20, 0.7) })).toEqual([
      { kind: 'habit_rate_up', tone: 'positive', params: { points: 20 } },
    ]);
    expect(buildHighlights({ ...quiet, ...habits(20, 0.5, 20, 0.7) })).toEqual([
      { kind: 'habit_rate_down', tone: 'attention', params: { points: 20 } },
    ]);
    expect(kinds(habits(20, 0.72, 20, 0.7))).toEqual([]);
    expect(kinds(habits(4, 1, 20, 0.5))).toEqual([]);
    expect(kinds(habits(20, 1, 4, 0.5))).toEqual([]);
    expect(kinds(habits(20, 1, 0, null))).toEqual([]);
  });

  it('names the most reliable habit and the one that slipped most', () => {
    const perHabit = [
      { name: 'Read', due: 20, missed: 1, rate: 0.95 },
      { name: 'Run', due: 10, missed: 7, rate: 0.3 },
      { name: 'Draw', due: 10, missed: 6, rate: 0.4 },
      { name: 'New', due: 2, missed: 2, rate: 0 },
    ];
    expect(buildHighlights({ ...quiet, perHabit })).toEqual([
      { kind: 'top_habit', tone: 'positive', params: { name: 'Read', percent: 95 } },
      {
        kind: 'struggling_habit',
        tone: 'attention',
        params: { name: 'Run', percent: 30, missed: 7 },
      },
    ]);
    // One habit alone is not "the best of" anything.
    expect(kinds({ perHabit: perHabit.slice(0, 1) })).toEqual([]);
  });

  it('points out weekdays only beyond a single week and a clear difference', () => {
    const byWeekday = [
      { weekday: 1, due: 4, rate: 1 },
      { weekday: 2, due: 4, rate: 0.75 },
      { weekday: 6, due: 4, rate: 0.25 },
      { weekday: 7, due: 2, rate: 0 },
    ];
    expect(buildHighlights({ ...quiet, byWeekday })).toEqual([
      { kind: 'best_weekday', tone: 'positive', params: { weekday: 1, percent: 100 } },
      { kind: 'weakest_weekday', tone: 'neutral', params: { weekday: 6, percent: 25 } },
    ]);
    expect(kinds({ byWeekday, period: 'week' })).toEqual([]);
    const even = byWeekday.map((day) => ({ ...day, rate: 0.8 }));
    expect(kinds({ byWeekday: even })).toEqual([]);
  });

  it('reports punctuality, task counts of finished periods and the busiest day', () => {
    const tasks = { completed: 9, onTime: 5, late: 1, previous: { completed: 6 } };
    const days = [
      { date: '2026-11-02', tasksCompleted: 5 },
      { date: '2026-11-03', tasksCompleted: 2 },
    ];
    expect(buildHighlights({ ...quiet, tasks, days })).toEqual([
      { kind: 'tasks_on_time', tone: 'positive', params: { percent: 83, onTime: 5, total: 6 } },
      { kind: 'tasks_completed_up', tone: 'positive', params: { count: 3, completed: 9 } },
      { kind: 'most_productive_day', tone: 'positive', params: { date: '2026-11-02', count: 5 } },
    ]);
    // A running period is not compared by counts, and a tie is not a busiest day.
    expect(
      kinds({
        tasks,
        complete: false,
        days: [
          { date: '2026-11-02', tasksCompleted: 5 },
          { date: '2026-11-03', tasksCompleted: 5 },
        ],
      }),
    ).toEqual(['tasks_on_time']);
    expect(kinds({ tasks: { ...tasks, onTime: 1, late: 5, completed: 4 } })).toEqual([
      'tasks_on_time',
      'tasks_completed_down',
    ]);
  });

  it('mentions completed goals and milestones and stops at six highlights', () => {
    expect(kinds({ goals: { completed: 1, milestonesCompleted: 2 } })).toEqual([
      'goals_completed',
      'milestones_completed',
    ]);
    const everything = buildHighlights({
      ...quiet,
      habits: { due: 20, rate: 0.9, previous: { due: 20, rate: 0.5 } },
      perHabit: [
        { name: 'Read', due: 20, missed: 0, rate: 1 },
        { name: 'Run', due: 10, missed: 8, rate: 0.2 },
      ],
      byWeekday: [
        { weekday: 1, due: 4, rate: 1 },
        { weekday: 2, due: 4, rate: 0.5 },
        { weekday: 3, due: 4, rate: 0.75 },
      ],
      tasks: { completed: 9, onTime: 5, late: 1, previous: { completed: 6 } },
      goals: { completed: 1, milestonesCompleted: 2 },
    });
    expect(everything).toHaveLength(6);
  });
});

describe('analytics overview', () => {
  useTestDatabase();
  afterEach(() => vi.useRealTimers());

  const overviewOf = async (user, query = '') =>
    (await user.get(`/analytics/overview${query}`).expect(200)).body.data;

  it('is empty but complete for a new account', async () => {
    setNow();
    const user = await registerUser();
    const overview = await overviewOf(user);
    expect(overview).toMatchObject({
      period: 'month',
      bucket: 'day',
      range: { from: '2026-11-01', to: '2026-11-30' },
      previousRange: { from: '2026-10-01', to: '2026-10-31' },
      today: TODAY,
      timeZone: 'Europe/Istanbul',
      complete: false,
      habits: {
        due: 0,
        completed: 0,
        missed: 0,
        rate: null,
        previous: { due: 0, completed: 0, rate: null },
        items: [],
      },
      tasks: {
        completed: 0,
        due: 0,
        dueCompleted: 0,
        onTime: 0,
        late: 0,
        withoutDueDate: 0,
        onTimeRate: null,
        overdueOpen: 0,
        previous: { completed: 0 },
        byCategory: [],
      },
      goals: { active: 0, completed: 0, milestonesCompleted: 0, items: [] },
      highlights: [],
    });
    expect(overview.series).toHaveLength(30);
    expect(overview.habits.byWeekday.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('counts habits, tasks and goals of a month from real records', async () => {
    setNow();
    const user = await registerUser();
    const post = async (path, body) => (await user.post(path, body).expect(201)).body.data;
    const dateOf = (dayOfMonth) => `2026-11-${String(dayOfMonth).padStart(2, '0')}`;

    // Read: daily from the 1st; missed on the 5th and 6th, skipped on the 10th, today open.
    const read = await post('/habits', { name: 'Read', color: '#0a84ff', startDate: dateOf(1) });
    for (let dayOfMonth = 1; dayOfMonth <= 23; dayOfMonth += 1) {
      if (dayOfMonth === 5 || dayOfMonth === 6) continue;
      const body = dayOfMonth === 10 ? { status: 'skipped' } : { value: 1 };
      await user.put(`/habits/${read.id}/entries/${dateOf(dayOfMonth)}`, body).expect(200);
    }
    // Gym: twice a week from Monday the 2nd. Met, missed, met; the current week is open.
    const gym = await post('/habits', {
      name: 'Gym',
      color: '#30d158',
      startDate: dateOf(2),
      schedule: { mode: 'flexible', period: 'week', timesPerPeriod: 2 },
    });
    for (const dayOfMonth of [3, 5, 11, 17, 20]) {
      await user.put(`/habits/${gym.id}/entries/${dateOf(dayOfMonth)}`, { value: 1 }).expect(200);
    }

    const marathon = await post('/goals', {
      title: 'Marathon',
      color: '#30d158',
      startDate: dateOf(1),
      targetDate: '2026-12-01',
      progress: { mode: 'milestones' },
    });
    let milestones = [];
    for (const title of ['5 km', '10 km', '21 km', '42 km']) {
      milestones = (await post(`/goals/${marathon.id}/milestones`, { title })).milestones;
    }
    await user
      .patch(`/goals/${marathon.id}/milestones/${milestones[0].id}`, { done: true })
      .expect(200);
    const course = await post('/goals', {
      title: 'Course',
      color: '#0a84ff',
      startDate: dateOf(1),
    });
    await user.patch(`/goals/${course.id}`, { status: 'completed' }).expect(200);

    const work = await post('/categories', { name: 'Work', color: '#0a84ff' });
    const onTime = await post('/tasks', { title: 'On time', dueDate: dateOf(10) });
    const late = await post('/tasks', { title: 'Late', dueDate: dateOf(10), priority: 'high' });
    const undated = await post('/tasks', { title: 'No date', categoryId: work.id });
    await post('/tasks', { title: 'Still open', dueDate: dateOf(20) });
    const earlier = await post('/tasks', { title: 'Last month' });
    const linked = await post('/tasks', { title: 'Train', dueDate: TODAY, goalId: marathon.id });

    const completeOn = async (task, date) => {
      vi.setSystemTime(new Date(noonOn(date)));
      await user.post(`/tasks/${task.id}/complete`).expect(200);
    };
    await completeOn(onTime, dateOf(9));
    await completeOn(late, dateOf(12));
    await completeOn(undated, dateOf(12));
    await completeOn(earlier, '2026-10-20');
    await completeOn(linked, TODAY);

    const overview = await overviewOf(user, '?period=month');

    // Habits: 23 past days, one skipped, two missed.
    expect(overview.habits).toMatchObject({
      due: 22,
      completed: 20,
      missed: 2,
      previous: { due: 0, completed: 0, rate: null },
    });
    expect(overview.habits.rate).toBeCloseTo(20 / 22);
    expect(overview.habits.byWeekday[3]).toEqual({
      weekday: 4,
      due: 3,
      completed: 2,
      rate: 2 / 3,
    });
    // Tuesdays: the 3rd and 17th count; the 10th was skipped and today is still open.
    expect(overview.habits.byWeekday[1]).toEqual({ weekday: 2, due: 2, completed: 2, rate: 1 });
    expect(overview.habits.items).toEqual([
      expect.objectContaining({
        habitId: read.id,
        unit: 'days',
        due: 22,
        completed: 20,
        missed: 2,
        skipped: 1,
        previousRate: null,
      }),
      expect.objectContaining({
        habitId: gym.id,
        unit: 'weeks',
        due: 3,
        completed: 2,
        missed: 1,
        rate: 2 / 3,
      }),
    ]);

    expect(overview.tasks).toEqual({
      completed: 4,
      due: 4,
      dueCompleted: 3,
      onTime: 2,
      late: 1,
      withoutDueDate: 1,
      onTimeRate: 2 / 3,
      overdueOpen: 1,
      previous: { completed: 1 },
      byPriority: [
        { priority: 'none', completed: 3 },
        { priority: 'low', completed: 0 },
        { priority: 'medium', completed: 0 },
        { priority: 'high', completed: 1 },
      ],
      byCategory: [
        { categoryId: null, name: null, color: null, completed: 3 },
        { categoryId: work.id, name: 'Work', color: '#0a84ff', completed: 1 },
      ],
    });

    expect(overview.series[11]).toEqual({
      from: dateOf(12),
      to: dateOf(12),
      habits: { due: 1, completed: 1, rate: 1 },
      tasks: { completed: 2 },
    });
    expect(overview.series[4].habits).toEqual({ due: 1, completed: 0, rate: 0 });
    expect(overview.series[9].habits).toEqual({ due: 0, completed: 0, rate: null });
    expect(overview.series[23].habits).toEqual({ due: 0, completed: 0, rate: null });

    expect(overview.goals).toEqual({
      active: 1,
      completed: 1,
      milestonesCompleted: 1,
      items: [
        {
          goalId: marathon.id,
          title: 'Marathon',
          color: '#30d158',
          icon: 'target',
          startDate: dateOf(1),
          targetDate: '2026-12-01',
          percent: 25,
          daysLeft: 7,
          // 23 of 30 days have passed; a quarter done is well behind that.
          expected: 77,
          pace: 'behind',
          milestonesCompleted: 1,
          tasksCompleted: 1,
        },
      ],
    });

    expect(overview.highlights.map((item) => item.kind)).toEqual([
      'top_habit',
      'best_weekday',
      'weakest_weekday',
      'goals_completed',
      'milestones_completed',
    ]);

    // The month before holds the one task finished then, and nothing else.
    const october = await overviewOf(user, '?period=month&date=2026-10-15');
    expect(october).toMatchObject({
      range: { from: '2026-10-01', to: '2026-10-31' },
      complete: true,
      habits: { due: 0, rate: null, items: [] },
      tasks: { completed: 1, previous: { completed: 0 } },
      goals: { completed: 0, milestonesCompleted: 0 },
    });
  });

  it('charts a week by days, a quarter by weeks and a year by months', async () => {
    setNow();
    const user = await registerUser();
    const habit = (
      await user
        .post('/habits', { name: 'Read', color: '#0a84ff', startDate: '2026-11-16' })
        .expect(201)
    ).body.data;
    for (const date of ['2026-11-16', '2026-11-17', '2026-11-23']) {
      await user.put(`/habits/${habit.id}/entries/${date}`, { value: 1 }).expect(200);
    }

    const week = await overviewOf(user, '?period=week');
    expect(week).toMatchObject({
      bucket: 'day',
      range: { from: '2026-11-23', to: '2026-11-29' },
      previousRange: { from: '2026-11-16', to: '2026-11-22' },
      // Only Monday can be judged so far; last week two of seven days were kept.
      habits: { due: 1, completed: 1, rate: 1, previous: { due: 7, completed: 2 } },
    });
    expect(week.series).toHaveLength(7);

    const quarter = await overviewOf(user, '?period=quarter');
    expect(quarter).toMatchObject({
      bucket: 'week',
      range: { from: '2026-10-01', to: '2026-12-31' },
      habits: { due: 8, completed: 3 },
    });
    const lastWeek = quarter.series.find((step) => step.from === '2026-11-16');
    expect(lastWeek).toMatchObject({ to: '2026-11-22', habits: { due: 7, completed: 2 } });
    expect(quarter.series.reduce((sum, step) => sum + step.habits.due, 0)).toBe(8);

    const year = await overviewOf(user, '?period=year');
    expect(year.bucket).toBe('month');
    expect(year.series).toHaveLength(12);
    expect(year.series[10]).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      habits: { due: 8, completed: 3 },
    });

    await user.get('/analytics/overview?period=decade').expect(400);
    await user.get('/analytics/overview?date=2026-13-01').expect(400);
  });

  it('expects nothing of a habit after it was archived', async () => {
    // The session is opened today; the past is visited with the same access token.
    setNow();
    const user = await registerUser();
    vi.setSystemTime(new Date(noonOn('2026-11-10')));
    const habit = (
      await user
        .post('/habits', { name: 'Run', color: '#30d158', startDate: '2026-11-01' })
        .expect(201)
    ).body.data;
    await user.put(`/habits/${habit.id}/entries/2026-11-02`, { value: 1 }).expect(200);
    await user.post(`/habits/${habit.id}/archive`).expect(200);

    vi.setSystemTime(new Date(NOON));
    const overview = await overviewOf(user);
    // Nine days before it was archived on the 10th; the two weeks since are not "missed".
    expect(overview.habits).toMatchObject({ due: 9, completed: 1, missed: 8 });
    expect(overview.habits.items).toEqual([
      expect.objectContaining({ habitId: habit.id, archived: true, due: 9, completed: 1 }),
    ]);
  });

  it('follows the week start of the user and keeps users apart', async () => {
    setNow();
    const user = await registerUser();
    const other = await registerUser();
    await other.post('/tasks', { title: 'Theirs' }).expect(201);
    const task = (await other.get('/tasks').expect(200)).body.data[0];
    await other.post(`/tasks/${task.id}/complete`).expect(200);

    expect((await overviewOf(user)).tasks.completed).toBe(0);
    expect((await overviewOf(other)).tasks.completed).toBe(1);

    const settings = (await user.get('/settings').expect(200)).body.data;
    await user.patch('/settings', { weekStart: 7, baseVersion: settings.version }).expect(200);
    const week = await overviewOf(user, '?period=week');
    expect(week.range).toEqual({ from: '2026-11-22', to: '2026-11-28' });
    expect(week.weekStart).toBe(7);

    await (await import('./helpers/client.js')).anonymous().get('/analytics/overview').expect(401);
  });
});
