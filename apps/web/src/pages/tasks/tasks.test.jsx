import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, noContent, ok, renderApp, signedInRoutes } from '../../test/harness.jsx';

const TODAY = '2026-11-24';

export function task(overrides = {}) {
  return {
    id: 'task-1',
    version: 1,
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
    title: 'Raporu yaz',
    description: '',
    categoryId: null,
    priority: 'none',
    status: 'todo',
    startDate: null,
    dueDate: TODAY,
    dueTime: null,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
    completedAt: null,
    completedOn: null,
    originalDueDate: null,
    postponedCount: 0,
    subtasks: [],
    recurrence: null,
    recurrenceEndDate: null,
    seriesId: null,
    goalId: null,
    habitId: null,
    sortOrder: 0,
    ...overrides,
  };
}

const day = (overrides = {}) => ({
  date: TODAY,
  today: TODAY,
  overdue: [],
  due: [],
  completed: [],
  summary: { total: 0, done: 0, overdue: 0 },
  ...overrides,
});

const baseRoutes = () => ({
  ...signedInRoutes(),
  'GET /categories': () => ok([]),
  'GET /goals': () => ok([]),
});

describe('tasks', () => {
  it('shows overdue and due tasks and completes one at once', async () => {
    const user = userEvent.setup();
    let report = task({
      priority: 'high',
      subtasks: [{ id: 's1', title: 'Taslak', done: true }],
    });
    const late = task({
      id: 'task-2',
      title: 'Fatura öde',
      dueDate: '2026-11-20',
      postponedCount: 2,
    });
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks/day': () => ok(day({ overdue: [late], due: [report] })),
      'POST /tasks/task-1/complete': () => {
        report = { ...report, status: 'done', completedOn: TODAY };
        return ok({ task: report, next: null });
      },
    });
    renderApp('/tasks');

    const overdue = await screen.findByRole('heading', { name: 'Geciken' });
    expect(overdue).toBeInTheDocument();
    expect(screen.getByText('20 Kas')).toBeInTheDocument();
    expect(screen.getByText('2 kez ertelendi')).toBeInTheDocument();
    expect(screen.getByText('Yüksek')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', {
      name: '"Raporu yaz" görevini tamamlandı olarak işaretle',
    });
    await user.click(checkbox);
    // Shown as done before the server has answered.
    await waitFor(() => expect(checkbox).toBeChecked());
    await waitFor(() => expect(api.calls('POST', '/tasks/task-1/complete')).toHaveLength(1));
    // Still done after the views were refreshed from the server.
    await waitFor(() => expect(api.calls('GET', '/tasks/day').length).toBeGreaterThan(1));
    expect(checkbox).toBeChecked();
  });

  it('adds a task for today from the quick add field', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks/day': () => ok(day()),
      'POST /tasks': ({ body }) => ok(task({ ...body, id: 'new' })),
    });
    renderApp('/tasks');

    expect(await screen.findByText('Bugün için görev yok')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Yeni görev' }), 'Süt al{Enter}');

    await waitFor(() => expect(api.calls('POST', '/tasks')).toHaveLength(1));
    expect(api.calls('POST', '/tasks')[0].body).toEqual({
      title: 'Süt al',
      dueDate: TODAY,
      goalId: null,
    });
    expect(await screen.findByText('Görev eklendi')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Yeni görev' })).toHaveValue(''),
    );
  });

  it('moves a task to tomorrow and deletes one from the menu', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks/day': () => ok(day({ due: [task()] })),
      'POST /tasks/task-1/postpone': ({ body }) =>
        ok(task({ dueDate: body.to, postponedCount: 1 })),
      'DELETE /tasks/task-1': () => noContent(),
    });
    renderApp('/tasks');

    await user.click(
      await screen.findByRole('button', { name: '"Raporu yaz" için diğer işlemler' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Yarına taşı' }));
    await waitFor(() =>
      expect(api.calls('POST', '/tasks/task-1/postpone')[0].body).toEqual({ to: '2026-11-25' }),
    );

    await user.click(screen.getByRole('button', { name: '"Raporu yaz" için diğer işlemler' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sil' }));
    await waitFor(() => expect(api.calls('DELETE', '/tasks/task-1')).toHaveLength(1));
  });

  it('creates a repeating task with subtasks from the form', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks/day': () => ok(day()),
      'POST /tasks': ({ body }) => ok(task({ ...body, id: 'new' })),
    });
    renderApp('/tasks');

    await user.click(await screen.findByRole('button', { name: 'Yeni görev' }));
    const dialog = screen.getByRole('dialog', { name: 'Yeni görev' });
    await user.type(within(dialog).getByLabelText('Başlık'), 'Çiçekleri sula');
    await user.click(within(dialog).getByRole('radio', { name: 'Orta' }));
    await user.selectOptions(within(dialog).getByLabelText('Tekrar'), 'daily');
    await user.click(within(dialog).getByRole('button', { name: 'Görev oluştur' }));
    // A repeating task needs a date to count from.
    expect(
      within(dialog).getByText('Tekrarlanan bir görevin son tarihi olmalıdır.'),
    ).toBeInTheDocument();
    expect(api.calls('POST', '/tasks')).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Son tarih/), '2026-11-25');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Yeni alt görev' }),
      'Balkon{Enter}',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Görev oluştur' }));

    await waitFor(() => expect(api.calls('POST', '/tasks')).toHaveLength(1));
    expect(api.calls('POST', '/tasks')[0].body).toMatchObject({
      title: 'Çiçekleri sula',
      priority: 'medium',
      dueDate: '2026-11-25',
      recurrence: { frequency: 'daily', interval: 1, weekdays: [], monthDays: [] },
      subtasks: [{ title: 'Balkon' }],
      scheduledDate: null,
      goalId: null,
    });
  });

  it('groups upcoming tasks by day using the server’s today', async () => {
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks/day': () => ok(day()),
      'GET /tasks': () =>
        ok(
          [
            task({ id: 'a', title: 'Yarınki iş', dueDate: '2026-11-25' }),
            task({ id: 'b', title: 'Haftaya', dueDate: '2026-12-01' }),
          ],
          { page: 1, limit: 100, total: 2, totalPages: 1, today: TODAY },
        ),
    });
    renderApp('/tasks/upcoming');

    expect(await screen.findByRole('heading', { name: 'Yarın · Çarşamba' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 Ara · Salı' })).toBeInTheDocument();
    expect(api.calls('GET', '/tasks')[0].query).toMatchObject({
      status: 'open',
      dueFrom: '2026-11-25',
      dueTo: '2026-12-08',
    });
  });

  it('searches the open tasks', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...baseRoutes(),
      'GET /tasks': ({ query }) =>
        ok(query.search ? [] : [task({ dueDate: null })], {
          page: 1,
          limit: 50,
          total: query.search ? 0 : 1,
          totalPages: 1,
          today: TODAY,
        }),
    });
    renderApp('/tasks/all');

    expect(await screen.findByRole('heading', { name: 'Tarihsiz' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Görevlerde ara' }), 'xyz');
    expect(await screen.findByText('Eşleşen görev yok')).toBeInTheDocument();
    expect(api.calls('GET', '/tasks').at(-1).query.search).toBe('xyz');
  });
});
