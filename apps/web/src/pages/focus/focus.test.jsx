import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  fail,
  mockApi,
  noContent,
  ok,
  renderApp,
  signedInRoutes,
} from '../../test/harness.jsx';
import { formatClock } from './FocusPage.jsx';

const TODAY = '2026-11-24';
// The server's clock is an hour ahead of this machine's: countdowns must follow the server.
const serverNow = () => Date.now() + 3_600_000;
const serverIso = (offsetSeconds = 0) => new Date(serverNow() + offsetSeconds * 1000).toISOString();

const session = (overrides = {}) => ({
  id: 'session-1',
  version: 1,
  kind: 'focus',
  status: 'running',
  plannedMinutes: 25,
  startedAt: serverIso(),
  pausedAt: null,
  pausedSeconds: 0,
  endsAt: serverIso(25 * 60),
  endedAt: null,
  elapsedSeconds: 0,
  date: TODAY,
  note: '',
  taskId: null,
  habitId: null,
  goalId: null,
  ...overrides,
});

const state = (overrides = {}) => ({
  serverTime: serverIso(),
  today: TODAY,
  session: null,
  settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
  suggestedKind: 'focus',
  todayFocus: { sessions: 0, seconds: 0 },
  week: Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-${18 + index}`,
    sessions: 0,
    seconds: 0,
  })),
  ...overrides,
});

const routes = (overrides = {}) => ({
  ...signedInRoutes(),
  'GET /focus': () => ok(state()),
  'GET /focus/sessions': () => ok([], { page: 1, limit: 10, total: 0, totalPages: 1 }),
  'GET /tasks/day': () =>
    ok({
      date: TODAY,
      today: TODAY,
      overdue: [],
      due: [{ id: 'task-1', title: 'Raporu yaz', status: 'todo' }],
      completed: [],
      summary: { total: 1, done: 0, overdue: 0 },
    }),
  ...overrides,
});

describe('focus timer', () => {
  it('formats the clock', () => {
    expect(formatClock(1500)).toBe('25:00');
    expect(formatClock(59.4)).toBe('00:59');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('offers the suggested session and starts it for the chosen task', async () => {
    let current = state({
      suggestedKind: 'short_break',
      todayFocus: { sessions: 2, seconds: 3000 },
      week: state().week.map((day, index) =>
        index === 6 ? { ...day, sessions: 2, seconds: 3000 } : day,
      ),
    });
    const apiMock = mockApi(
      routes({
        'GET /focus': () => ok(current),
        'POST /focus/sessions': ({ body }) => {
          const started = session({ kind: body.kind, taskId: body.taskId ?? null });
          current = { ...current, session: started, serverTime: serverIso() };
          return ok(started);
        },
      }),
    );
    renderApp('/');
    await userEvent.click(await screen.findByRole('link', { name: 'Odak' }));

    // After two focus sessions the server suggests a break.
    expect(await screen.findByRole('radio', { name: 'Kısa mola' })).toBeChecked();
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(screen.getByText('50 dakika odak')).toBeInTheDocument();
    expect(screen.getByText('2 odak oturumu')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[7]).toHaveTextContent('24 Kasım Salı50 dakika2 oturum');

    await userEvent.click(screen.getByRole('radio', { name: 'Odak' }));
    expect(screen.getByRole('timer')).toHaveTextContent('25:00');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Üzerinde çalışılan görev/ }),
      'Raporu yaz',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Başlat' }));

    expect(await screen.findByRole('button', { name: 'Duraklat' })).toBeInTheDocument();
    expect(apiMock.calls('POST', '/focus/sessions')[0].body).toEqual({
      kind: 'focus',
      taskId: 'task-1',
    });
    expect(screen.getByText('Sürüyor')).toBeInTheDocument();
    expect(screen.getByText('Görev: Raporu yaz')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Odak' })).not.toBeInTheDocument();
    expect(document.title).toMatch(/^2[45]:\d\d · Odak$/);
  });

  it('counts down against the server clock and pauses and resumes', async () => {
    let current = state({ session: session({ endsAt: serverIso(10 * 60) }) });
    const apiMock = mockApi(
      routes({
        'GET /focus': () => ok({ ...current, serverTime: serverIso() }),
        'POST /focus/sessions/session-1/pause': () => {
          const paused = session({
            status: 'paused',
            pausedAt: serverIso(),
            endsAt: null,
            elapsedSeconds: 900,
            version: 2,
          });
          current = { ...current, session: paused };
          return ok(paused);
        },
        'POST /focus/sessions/session-1/resume': () => {
          const resumed = session({ endsAt: serverIso(10 * 60), pausedSeconds: 30, version: 3 });
          current = { ...current, session: resumed };
          return ok(resumed);
        },
      }),
    );
    renderApp('/focus');

    // Ten minutes are left on the server, whatever this machine's clock says.
    expect(await screen.findByRole('timer')).toHaveTextContent(/^(10:00|09:5\d)$/);

    await userEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    expect(await screen.findByText('Duraklatıldı')).toBeInTheDocument();
    // 25 minutes planned, 15 spent.
    expect(screen.getByRole('timer')).toHaveTextContent('10:00');
    expect(screen.queryByRole('button', { name: 'Duraklat' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(await screen.findByRole('button', { name: 'Duraklat' })).toBeInTheDocument();
    expect(apiMock.calls('POST', '/focus/sessions/session-1/resume')).toHaveLength(1);
  });

  it('reports the end once when the countdown reaches zero', async () => {
    let current = state({ session: session({ endsAt: serverIso(1) }) });
    const apiMock = mockApi(
      routes({
        'GET /focus': () => ok({ ...current, serverTime: serverIso() }),
        'POST /focus/sessions/session-1/complete': () => {
          const done = session({
            status: 'completed',
            endsAt: null,
            endedAt: serverIso(),
            elapsedSeconds: 1500,
            version: 2,
          });
          current = state({
            suggestedKind: 'short_break',
            todayFocus: { sessions: 1, seconds: 1500 },
          });
          return ok(done);
        },
      }),
    );
    renderApp('/focus');

    expect(
      await screen.findByText('Odak oturumu tamamlandı. Mola zamanı.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Kısa mola' })).toBeChecked();
    expect(screen.getByText('25 dakika odak')).toBeInTheDocument();
    expect(apiMock.calls('POST', '/focus/sessions/session-1/complete')).toHaveLength(1);
  });

  it('finishes or abandons a session and shows one that is already running elsewhere', async () => {
    let current = state();
    const running = session();
    const apiMock = mockApi(
      routes({
        'GET /focus': () => ok({ ...current, serverTime: serverIso() }),
        'POST /focus/sessions': () => {
          // Another device started a session a moment ago.
          current = { ...current, session: running };
          return fail(409, 'INVALID_STATE', 'Bu işlem şu anda yapılamıyor.', {
            reason: 'session_active',
            sessionId: running.id,
          });
        },
        'POST /focus/sessions/session-1/cancel': () => {
          current = { ...current, session: null };
          return ok(session({ status: 'cancelled', endsAt: null, endedAt: serverIso() }));
        },
      }),
    );
    renderApp('/focus');

    await userEvent.click(await screen.findByRole('button', { name: 'Başlat' }));
    expect(
      await screen.findByText('Zaten süren bir oturum var; o gösteriliyor.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Bitir' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(await screen.findByRole('button', { name: 'Başlat' })).toBeInTheDocument();
    expect(apiMock.calls('POST', '/focus/sessions/session-1/cancel')).toHaveLength(1);
  });

  it('changes the timer lengths in the account', async () => {
    const apiMock = mockApi(
      routes({
        'PATCH /settings': ({ body }) =>
          ok({ ...account().settings, focus: body.focus, version: 2 }),
      }),
    );
    renderApp('/focus');

    await userEvent.click(await screen.findByRole('button', { name: 'Süreler' }));
    const dialog = await screen.findByRole('dialog', { name: 'Zamanlayıcı süreleri' });
    const focusMinutes = within(dialog).getByRole('spinbutton', { name: 'Odak (dakika)' });
    expect(focusMinutes).toHaveValue(25);

    await userEvent.clear(focusMinutes);
    await userEvent.type(focusMinutes, '0');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      '1 ile 180 arasında bir tam sayı girin.',
    );
    expect(within(dialog).getByRole('button', { name: 'Kaydet' })).toBeDisabled();

    await userEvent.clear(focusMinutes);
    await userEvent.type(focusMinutes, '50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(apiMock.calls('PATCH', '/settings')).toHaveLength(1));
    expect(apiMock.calls('PATCH', '/settings')[0].body).toEqual({
      focus: { focusMinutes: 50, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      baseVersion: 1,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lists recent sessions and deletes one', async () => {
    let items = [
      session({
        id: 'session-9',
        status: 'completed',
        endsAt: null,
        endedAt: '2026-11-24T08:25:00.000Z',
        startedAt: '2026-11-24T08:00:00.000Z',
        elapsedSeconds: 1500,
        note: 'Bölüm bir',
      }),
      session({
        id: 'session-8',
        kind: 'short_break',
        status: 'cancelled',
        endsAt: null,
        endedAt: '2026-11-24T07:32:00.000Z',
        startedAt: '2026-11-24T07:30:00.000Z',
        elapsedSeconds: 120,
      }),
    ];
    const apiMock = mockApi(
      routes({
        'GET /focus/sessions': () =>
          ok(items, { page: 1, limit: 10, total: items.length, totalPages: 1 }),
        'DELETE /focus/sessions/session-8': () => {
          items = items.slice(0, 1);
          return noContent();
        },
      }),
    );
    renderApp('/focus');

    const history = (await screen.findByRole('heading', { name: 'Son oturumlar' })).closest(
      'section',
    );
    const rows = await within(history).findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('OdakBölüm bir24.11.2026 11:0025 dkTamamlandı');
    expect(rows[1]).toHaveTextContent('Kısa mola24.11.2026 10:302 dkVazgeçildi');

    await userEvent.click(within(history).getByRole('button', { name: 'Kısa mola oturumunu sil' }));
    expect(await screen.findByText('Oturum silindi')).toBeInTheDocument();
    await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(1));
    expect(apiMock.calls('DELETE', '/focus/sessions/session-8')).toHaveLength(1);
  });

  it('offers a retry when the timer cannot be loaded', async () => {
    let failing = true;
    mockApi(routes({ 'GET /focus': () => (failing ? fail(500, 'INTERNAL_ERROR') : ok(state())) }));
    renderApp('/focus');
    const retry = await screen.findByRole('button', { name: 'Yeniden dene' });
    failing = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Başlat' })).toBeInTheDocument();
  });
});
