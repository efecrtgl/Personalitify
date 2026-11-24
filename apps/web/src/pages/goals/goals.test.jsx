import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fail, mockApi, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';

const TODAY = '2026-11-24';

function goal(overrides = {}) {
  return {
    id: 'goal-1',
    version: 3,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    title: 'Yarı maraton koş',
    description: 'Sağlığım için.',
    categoryId: null,
    color: '#30d158',
    icon: 'footprints',
    horizon: 'long',
    startDate: '2026-11-01',
    targetDate: '2026-12-24',
    status: 'active',
    completedAt: null,
    milestones: [],
    reviews: [],
    parentGoalId: null,
    habitIds: [],
    sortOrder: 0,
    ...overrides,
    progress: {
      mode: 'manual',
      value: 40,
      current: 0,
      target: 100,
      unit: '',
      ...overrides.progress,
    },
    computed: {
      percent: 40,
      milestones: { total: 0, done: 0 },
      tasks: { total: 0, done: 0, open: 0 },
      daysLeft: 30,
      overdue: false,
      ...overrides.computed,
    },
  };
}

const baseRoutes = () => ({
  ...signedInRoutes(),
  'GET /categories': () => ok([]),
  'GET /habits': () => ok([]),
  'GET /habits/day': () =>
    ok({
      date: TODAY,
      today: TODAY,
      items: [],
      summary: { due: 0, completed: 0, skipped: 0, postponed: 0, rate: null },
    }),
});

const emptyTasks = () => ok([], { page: 1, limit: 100, total: 0, totalPages: 1, today: TODAY });

describe('goals list', () => {
  it('shows progress, deadline and counts, and filters by status', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /goals': ({ query }) =>
        ok(
          query.status === 'completed'
            ? []
            : [
                goal({
                  computed: {
                    percent: 62.5,
                    milestones: { total: 4, done: 2 },
                    tasks: { total: 8, done: 5, open: 3 },
                  },
                }),
                goal({
                  id: 'goal-2',
                  title: 'Kitap yaz',
                  computed: { percent: 10, daysLeft: -3, overdue: true },
                }),
              ],
        ),
    });
    renderApp('/goals');

    expect(await screen.findByRole('heading', { name: 'Yarı maraton koş' })).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Yarı maraton koş hedefinin ilerlemesi' }),
    ).toHaveAttribute('aria-valuenow', '62.5');
    expect(screen.getByText('%63')).toBeInTheDocument();
    expect(screen.getByText('30 gün kaldı')).toBeInTheDocument();
    expect(screen.getByText('3 gün gecikti')).toBeInTheDocument();
    expect(screen.getByText('2/4 kilometre taşı')).toBeInTheDocument();
    expect(screen.getByText('5/8 görev')).toBeInTheDocument();
    expect(api.calls('GET', '/goals')[0].query).toEqual({ status: 'open', parentGoalId: 'none' });

    await user.click(screen.getByRole('radio', { name: 'Ulaşılan' }));
    expect(await screen.findByText('Henüz ulaşılan hedef yok')).toBeInTheDocument();
  });

  it('creates a goal measured by a number', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /goals': () => ok([]),
      'POST /goals': ({ body }) => ok(goal({ ...body, id: 'new' })),
    });
    renderApp('/goals');

    await user.click((await screen.findAllByRole('button', { name: 'Yeni hedef' }))[0]);
    const dialog = screen.getByRole('dialog', { name: 'Yeni hedef' });
    await user.click(within(dialog).getByRole('button', { name: 'Hedef oluştur' }));
    expect(within(dialog).getByText('Bu alan zorunludur.')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: 'Hedef' }), 'Birikim yap');
    await user.click(within(dialog).getByRole('radio', { name: 'Uzun vadeli' }));
    await user.selectOptions(
      within(dialog).getByLabelText('İlerleme şuna göre hesaplanır'),
      'metric',
    );
    const target = within(dialog).getByLabelText('Hedef miktar');
    await user.clear(target);
    await user.type(target, '50000');
    await user.type(within(dialog).getByLabelText(/^Birim/), 'TL');
    await user.click(within(dialog).getByRole('button', { name: 'Hedef oluştur' }));

    await waitFor(() => expect(api.calls('POST', '/goals')).toHaveLength(1));
    expect(api.calls('POST', '/goals')[0].body).toMatchObject({
      title: 'Birikim yap',
      horizon: 'long',
      startDate: TODAY,
      targetDate: null,
      progress: { mode: 'metric', target: 50000, unit: 'TL' },
      parentGoalId: null,
      habitIds: [],
    });
    expect(await screen.findByText('Hedef oluşturuldu')).toBeInTheDocument();
  });
});

describe('goal detail', () => {
  const detailRoutes = (current) => ({
    ...baseRoutes(),
    'GET /goals': () => ok([]),
    'GET /goals/goal-1': () => ok({ goal: current(), subGoals: [], habits: [] }),
    'GET /goals/goal-1/history': () =>
      ok([
        {
          eventId: 'e2',
          event: 'goal.updated',
          version: 3,
          at: '2026-11-20T10:00:00.000Z',
          changedFields: ['status', 'targetDate'],
          status: 'active',
        },
        {
          eventId: 'e1',
          event: 'goal.created',
          version: 1,
          at: '2026-11-01T10:00:00.000Z',
          changedFields: [],
          status: 'active',
        },
      ]),
    'GET /tasks': emptyTasks,
  });

  it('ticks a milestone, adds one and writes a review', async () => {
    const user = userEvent.setup();
    let state = goal({
      progress: { mode: 'milestones' },
      milestones: [
        { id: 'm1', title: '10 km koş', targetDate: '2026-12-01', done: false, completedAt: null },
      ],
      computed: { percent: 0, milestones: { total: 1, done: 0 } },
    });
    const api = mockApi({
      ...detailRoutes(() => state),
      'PATCH /goals/goal-1/milestones/m1': ({ body }) => {
        state = {
          ...state,
          milestones: [{ ...state.milestones[0], done: body.done }],
          computed: { ...state.computed, percent: 100, milestones: { total: 1, done: 1 } },
        };
        return ok(state);
      },
      'POST /goals/goal-1/milestones': ({ body }) => {
        state = {
          ...state,
          milestones: [
            ...state.milestones,
            { id: 'm2', title: body.title, targetDate: null, done: false, completedAt: null },
          ],
        };
        return ok(state);
      },
      'POST /goals/goal-1/reviews': ({ body }) => {
        state = {
          ...state,
          reviews: [{ id: 'r1', date: TODAY, note: body.note, rating: body.rating, percent: 100 }],
        };
        return ok(state);
      },
    });
    renderApp('/goals/goal-1');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Yarı maraton koş' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hedef tarihi: 24 Aralık 2026')).toBeInTheDocument();
    expect(await screen.findByText('Değişti: durum, hedef tarihi')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /10 km koş/ }));
    await waitFor(() =>
      expect(api.calls('PATCH', '/goals/goal-1/milestones/m1')[0].body).toEqual({ done: true }),
    );
    expect(await screen.findByText('%100')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Yeni kilometre taşı' }),
      '21 km koş{Enter}',
    );
    expect(await screen.findByRole('checkbox', { name: /21 km koş/ })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Nasıl gidiyor?' }), 'İyi gidiyor.');
    await user.selectOptions(screen.getByRole('combobox', { name: /nasıl hissediyorsunuz/ }), '4');
    await user.click(screen.getByRole('button', { name: 'Değerlendirme ekle' }));
    expect(await screen.findByText('İyi gidiyor.')).toBeInTheDocument();
    expect(api.calls('POST', '/goals/goal-1/reviews')[0].body).toEqual({
      note: 'İyi gidiyor.',
      rating: 4,
    });
  });

  it('marks a goal as achieved with its version', async () => {
    const user = userEvent.setup();
    let state = goal();
    const api = mockApi({
      ...detailRoutes(() => state),
      'PATCH /goals/goal-1': ({ body }) => {
        state = { ...state, status: body.status, version: 4 };
        return ok(state);
      },
    });
    renderApp('/goals/goal-1');

    await user.click(await screen.findByRole('button', { name: 'Ulaşıldı olarak işaretle' }));
    await waitFor(() =>
      expect(api.calls('PATCH', '/goals/goal-1')[0].body).toEqual({
        status: 'completed',
        baseVersion: 3,
      }),
    );
    expect(await screen.findByRole('button', { name: 'Yeniden aç' })).toBeInTheDocument();
  });

  it('adds a task to the goal and says so when the goal does not exist', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...detailRoutes(() => goal()),
      'POST /tasks': ({ body }) => ok({ id: 't1', ...body }),
      'GET /goals/missing': () => fail(404, 'NOT_FOUND', 'İstenen kayıt bulunamadı.'),
    });
    const view = renderApp('/goals/goal-1');
    await user.type(
      await screen.findByRole('textbox', { name: 'Yeni görev' }),
      'Koşu ayakkabısı al{Enter}',
    );
    await waitFor(() =>
      expect(api.calls('POST', '/tasks')[0].body).toEqual({
        title: 'Koşu ayakkabısı al',
        dueDate: null,
        goalId: 'goal-1',
      }),
    );

    view.unmount();
    renderApp('/goals/missing');
    expect(await screen.findByText('Bu hedef mevcut değil')).toBeInTheDocument();
  });
});
