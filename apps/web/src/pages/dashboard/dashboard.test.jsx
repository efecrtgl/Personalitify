import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  emptyDashboard,
  fail,
  mockApi,
  ok,
  renderApp,
  signedInRoutes,
} from '../../test/harness.jsx';

const TODAY = '2026-11-24';

const habit = {
  id: 'habit-1',
  version: 1,
  name: 'Kitap oku',
  color: '#5e5ce6',
  icon: 'book',
  streakGoal: 30,
  target: { kind: 'check', value: 1, unit: '' },
  schedule: {
    mode: 'fixed',
    recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
    period: 'week',
    timesPerPeriod: 1,
  },
};
const habitItem = (overrides = {}) => ({
  habitId: 'habit-1',
  date: TODAY,
  state: 'pending',
  due: true,
  value: 0,
  target: 1,
  progress: 0,
  entry: null,
  period: null,
  streak: { current: 12, best: 12, unit: 'days' },
  habit,
  ...overrides,
});
const task = (overrides = {}) => ({
  id: 'task-1',
  version: 1,
  title: 'Raporu yaz',
  status: 'todo',
  priority: 'high',
  dueDate: TODAY,
  dueTime: null,
  subtasks: [],
  recurrence: null,
  postponedCount: 0,
  categoryId: null,
  ...overrides,
});

function fullDashboard() {
  return emptyDashboard({
    habits: {
      summary: { due: 2, completed: 1, skipped: 0, postponed: 0, rate: 0.5 },
      items: [habitItem()],
    },
    tasks: {
      summary: { total: 3, done: 1, overdue: 1, open: 4 },
      overdue: [
        task({ id: 'task-0', title: 'Fatura öde', dueDate: '2026-11-20', priority: 'none' }),
      ],
      due: [task()],
      completed: [],
    },
    upcoming: [
      {
        id: 'event:e1:2026-11-25',
        kind: 'event',
        title: 'Proje sunumu',
        color: '#ff375f',
        allDay: false,
        date: '2026-11-25',
        startTime: '11:00',
        endDate: '2026-11-25',
        endTime: '12:30',
      },
    ],
    goals: [
      {
        id: 'goal-1',
        title: 'Yarı maraton',
        color: '#30d158',
        status: 'active',
        computed: { percent: 62.5, daysLeft: 3, overdue: false },
      },
    ],
    week: {
      days: [
        ['2026-11-18', 2, 1, 0],
        ['2026-11-19', 2, 2, 1],
        ['2026-11-20', 2, 2, 0],
        ['2026-11-21', 2, 0, 0],
        ['2026-11-22', 2, 2, 2],
        ['2026-11-23', 2, 2, 0],
        ['2026-11-24', 2, 1, 1],
      ].map(([date, due, completed, tasksCompleted]) => ({ date, due, completed, tasksCompleted })),
      habits: { due: 14, completed: 10, rate: 10 / 14, previousRate: 0.5 },
      tasksCompleted: 4,
      previousTasksCompleted: 2,
    },
    streaks: [
      {
        habitId: 'habit-1',
        name: 'Kitap oku',
        color: '#5e5ce6',
        icon: 'book',
        current: 12,
        best: 12,
        unit: 'days',
      },
    ],
    insights: [
      { kind: 'overdue_tasks', tone: 'attention', params: { count: 1 } },
      {
        kind: 'habit_rate_up',
        tone: 'positive',
        params: { current: 71, previous: 50, change: 21 },
      },
      { kind: 'busy_day', tone: 'neutral', params: { date: '2026-11-26', count: 3 } },
    ],
    activity: [
      {
        id: 'a1',
        kind: 'habit_completed',
        title: 'Kitap oku',
        entityType: 'habitEntry',
        entityId: 'habit-1',
        at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      },
      {
        id: 'a2',
        kind: 'goal_created',
        title: 'Yarı maraton',
        entityType: 'goal',
        entityId: 'goal-1',
        at: new Date(Date.now() - 26 * 3600_000).toISOString(),
      },
    ],
  });
}

describe('dashboard', () => {
  it('greets the user and shows real figures from every module', async () => {
    mockApi({ ...signedInRoutes(), 'GET /dashboard': () => ok(fullDashboard()) });
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: /Ada$/ })).toBeInTheDocument();
    expect(await screen.findByText('24 Kasım Salı')).toBeInTheDocument();

    // Today.
    const today = screen.getByRole('heading', { name: 'Bugün' }).closest('section');
    expect(
      within(today).getByRole('img', { name: 'Bugün 2 alışkanlıktan 1 tanesi tamamlandı' }),
    ).toBeInTheDocument();
    expect(within(today).getByText('%50')).toBeInTheDocument();
    expect(within(today).getByText('1 / 3')).toBeInTheDocument();
    expect(within(today).getByText('1 gecikmiş')).toBeInTheDocument();

    // Habits, tasks, events, goals.
    expect(
      screen.getByRole('checkbox', { name: /Kitap oku alışkanlığını tamamlandı/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Fatura öde')).toBeInTheDocument();
    expect(screen.getByText('Proje sunumu')).toBeInTheDocument();
    expect(screen.getByText('Yarın · 11:00 – 12:30')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Yarı maraton hedefinin ilerlemesi' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 gün kaldı')).toBeInTheDocument();

    // The week, with the same numbers available as a table.
    const week = screen.getByRole('heading', { name: 'Son 7 gün' }).closest('section');
    expect(within(week).getByText('%71')).toBeInTheDocument();
    expect(within(week).getByText('Önceki haftaya göre 21 puan fazla')).toBeInTheDocument();
    expect(within(week).getByText('4 görev tamamlandı')).toBeInTheDocument();
    const rows = within(within(week).getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(rows[4]).toHaveTextContent('21 Kasım Cumartesi0 / 20');

    // Streaks, insights with their rules, activity.
    expect(screen.getAllByText('12 gün').length).toBeGreaterThan(0);
    expect(screen.getByText('1 açık görevin son tarihi geçti.')).toBeInTheDocument();
    expect(screen.getByText(/%71 kadarını tamamladınız; önceki hafta %50 idi/)).toBeInTheDocument();
    expect(screen.getByText('26 Kasım Perşembe günü için saatli 3 kayıt var.')).toBeInTheDocument();
    expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent(
      'Son tarihi bugünden önce olan açık görevler.',
    );
    expect(screen.getByRole('link', { name: 'Kitap oku tamamlandı' })).toHaveAttribute(
      'href',
      '/habits/habit-1',
    );
    expect(screen.getByText('3 saat önce')).toBeInTheDocument();
  });

  it('shows helpful empty states for a new account', async () => {
    mockApi(signedInRoutes());
    renderApp('/');
    expect(await screen.findByText('Bugün zamanı gelen alışkanlık yok')).toBeInTheDocument();
    expect(screen.getByText('Bugün için açık görev yok')).toBeInTheDocument();
    expect(screen.getByText('Etkin hedef yok')).toBeInTheDocument();
    expect(screen.getByText('Yaptıklarınız burada listelenecek')).toBeInTheDocument();
  });

  it('completes a habit from the dashboard and refreshes the figures', async () => {
    const user = userEvent.setup();
    let state = fullDashboard();
    const api = mockApi({
      ...signedInRoutes(),
      'GET /dashboard': () => ok(state),
      'PUT /habits/habit-1/entries/2026-11-24': () => {
        const updated = habitItem({
          state: 'completed',
          value: 1,
          progress: 1,
          streak: { current: 13, best: 13, unit: 'days' },
        });
        state = {
          ...state,
          habits: { summary: { ...state.habits.summary, completed: 2, rate: 1 }, items: [updated] },
        };
        return ok(updated);
      },
    });
    renderApp('/');

    await user.click(
      await screen.findByRole('checkbox', { name: /Kitap oku alışkanlığını tamamlandı/ }),
    );
    await waitFor(() =>
      expect(api.calls('PUT', '/habits/habit-1/entries/2026-11-24')[0].body).toEqual({ value: 1 }),
    );
    // The dashboard is fetched again after the change and shows the new totals.
    expect(await screen.findByText('%100')).toBeInTheDocument();
    expect(api.calls('GET', '/dashboard').length).toBeGreaterThan(1);
  });

  it('adds a task through a quick action', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...signedInRoutes(),
      'POST /tasks': ({ body }) => ok({ id: 'new', ...body }),
    });
    renderApp('/');

    const actions = (await screen.findByRole('heading', { name: 'Hızlı işlemler' })).closest(
      'section',
    );
    await user.click(within(actions).getByRole('button', { name: 'Yeni görev' }));
    const dialog = screen.getByRole('dialog', { name: 'Yeni görev' });
    // The new task is due today, the day the dashboard is about.
    expect(within(dialog).getByLabelText(/^Son tarih/)).toHaveValue(TODAY);
    await user.type(within(dialog).getByLabelText('Başlık'), 'Market alışverişi');
    await user.click(within(dialog).getByRole('button', { name: 'Görev oluştur' }));

    await waitFor(() => expect(api.calls('POST', '/tasks')).toHaveLength(1));
    expect(api.calls('POST', '/tasks')[0].body).toMatchObject({
      title: 'Market alışverişi',
      dueDate: TODAY,
    });
    await waitFor(() => expect(api.calls('GET', '/dashboard').length).toBeGreaterThan(1));
  });

  it('follows the layout stored in the account', async () => {
    const me = account({
      settings: {
        dashboard: {
          widgets: [
            { id: 'tasks', visible: true },
            { id: 'progress', visible: true },
            { id: 'habits', visible: false },
            { id: 'week', visible: false },
          ],
        },
      },
    });
    mockApi({ ...signedInRoutes(me), 'GET /dashboard': () => ok(fullDashboard()) });
    renderApp('/');

    await screen.findByText('Fatura öde');
    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['Bugünün görevleri', 'Bugün']);
  });

  it('rearranges, hides and restores widgets and saves the layout to the account', async () => {
    const user = userEvent.setup();
    const me = account();
    const api = mockApi({
      ...signedInRoutes(me),
      'PATCH /settings': ({ body }) => ok({ ...me.settings, ...body, version: 2 }),
    });
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Özelleştir' }));
    const dialog = screen.getByRole('dialog', { name: 'Panoyu özelleştir' });
    const order = () =>
      within(dialog)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label').textContent);
    expect(order().slice(0, 3)).toEqual(['Bugün', 'Hızlı işlemler', 'Bugünün alışkanlıkları']);

    await user.click(
      within(dialog).getByRole('button', { name: 'Bugünün alışkanlıkları bileşenini yukarı taşı' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Bugünün alışkanlıkları bileşenini yukarı taşı' }),
    );
    expect(order().slice(0, 3)).toEqual(['Bugünün alışkanlıkları', 'Bugün', 'Hızlı işlemler']);
    // The first widget cannot move further up.
    expect(
      within(dialog).getByRole('button', { name: 'Bugünün alışkanlıkları bileşenini yukarı taşı' }),
    ).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Son etkinlikler' }));
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(api.calls('PATCH', '/settings')).toHaveLength(1));
    const saved = api.calls('PATCH', '/settings')[0].body;
    expect(saved.baseVersion).toBe(1);
    expect(saved.dashboard.widgets.slice(0, 2)).toEqual([
      { id: 'habits', visible: true },
      { id: 'progress', visible: true },
    ]);
    expect(saved.dashboard.widgets.find((widget) => widget.id === 'activity')).toEqual({
      id: 'activity',
      visible: false,
    });
    // The page follows the saved layout.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles[0]).toBe('Bugünün alışkanlıkları');
    expect(titles).not.toContain('Son etkinlikler');

    // Restoring brings back the default order with everything visible.
    await user.click(screen.getByRole('button', { name: 'Özelleştir' }));
    const again = screen.getByRole('dialog', { name: 'Panoyu özelleştir' });
    await user.click(within(again).getByRole('button', { name: 'Varsayılana dön' }));
    const boxes = within(again).getAllByRole('checkbox');
    expect(boxes[0].closest('label')).toHaveTextContent('Bugün');
    expect(boxes.every((box) => box.checked)).toBe(true);
  });

  it('offers a retry when the dashboard cannot be loaded', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    mockApi({
      ...signedInRoutes(),
      'GET /dashboard': () => {
        attempts += 1;
        return attempts === 1
          ? fail(500, 'INTERNAL_ERROR', 'Bizden kaynaklanan bir sorun oluştu.')
          : ok(emptyDashboard());
      },
    });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bizden kaynaklanan bir sorun oluştu.',
    );
    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(await screen.findByText('Etkin hedef yok')).toBeInTheDocument();
  });
});
