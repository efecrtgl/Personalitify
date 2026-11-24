import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFormatters } from '../lib/format.js';
import { i18n } from '../lib/i18n.js';
import { fail, mockApi, noContent, ok, renderApp, signedInRoutes } from '../test/harness.jsx';
import { notificationText } from './NotificationsMenu.jsx';

const notification = (id, kind, params, overrides = {}) => ({
  id,
  version: 1,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  kind,
  params,
  entityType: null,
  entityId: null,
  silent: false,
  read: false,
  readAt: null,
  ...overrides,
});

/** A stateful notifications API over `initial`. */
function notificationRoutes(initial) {
  let items = [...initial];
  const page = () =>
    ok(items, {
      page: 1,
      limit: 20,
      total: items.length,
      totalPages: 1,
      unread: items.filter((item) => !item.read).length,
    });
  const routes = {
    ...signedInRoutes(),
    'GET /notifications': page,
    'POST /notifications/read-all': () => {
      const updated = items.filter((item) => !item.read).length;
      items = items.map((item) => ({ ...item, read: true, readAt: new Date().toISOString() }));
      return ok({ updated });
    },
  };
  for (const item of initial) {
    routes[`POST /notifications/${item.id}/read`] = () => {
      items = items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry));
      return ok({ ...item, read: true });
    };
    routes[`DELETE /notifications/${item.id}`] = () => {
      items = items.filter((entry) => entry.id !== item.id);
      return noContent();
    };
  }
  return routes;
}

describe('notification text', () => {
  const t = i18n.getFixedT('tr');
  const format = createFormatters({ locale: 'tr', timeZone: 'Europe/Istanbul' });
  const text = (kind, params) => notificationText(t, format, { kind, params });

  it('phrases every kind from its values', () => {
    expect(text('habit_reminder', { name: 'Kitap oku', time: '09:00' })).toBe(
      'Kitap oku için zaman geldi (09:00).',
    );
    expect(text('task_due', { title: 'Ara', time: '14:30' })).toBe(
      '“Ara” görevinin saati geldi (14:30).',
    );
    expect(text('tasks_today', { due: 3, overdue: 1 })).toBe(
      'Bugün için 3 görev var; 1 görev gecikmiş.',
    );
    expect(text('tasks_today', { due: 2, overdue: 0 })).toBe('Bugün için 2 görev var.');
    expect(text('tasks_today', { due: 0, overdue: 4 })).toBe('4 görev gecikmiş.');
    expect(text('goal_deadline', { title: 'Maraton', days: 3 })).toBe(
      '“Maraton” hedefine 3 gün kaldı.',
    );
    expect(text('goal_deadline', { title: 'Maraton', days: 0 })).toBe(
      '“Maraton” hedefinin tarihi bugün.',
    );
    expect(text('event_reminder', { title: 'Toplantı', minutes: 0 })).toBe(
      '“Toplantı” şimdi başlıyor.',
    );
    expect(text('event_reminder', { title: 'Toplantı', minutes: 30 })).toBe(
      '“Toplantı” 30 dakika sonra başlıyor.',
    );
    expect(text('event_reminder', { title: 'Toplantı', minutes: 120 })).toBe(
      '“Toplantı” 2 saat sonra başlıyor.',
    );
    expect(text('event_reminder', { title: 'Toplantı', minutes: 1440 })).toBe(
      '“Toplantı” 1 gün sonra başlıyor.',
    );
    expect(text('achievement_unlocked', { key: 'streak_7' })).toBe(
      'Yeni başarı: Bir haftalık seri.',
    );
    expect(text('focus_completed', { kind: 'focus', minutes: 25 })).toBe(
      '25 dakikalık odak oturumu tamamlandı.',
    );
    expect(text('focus_completed', { kind: 'short_break', minutes: 5 })).toBe('Mola bitti.');
  });
});

describe('notifications menu', () => {
  it('shows the unread count and lists what happened', async () => {
    mockApi(
      notificationRoutes([
        notification('n1', 'habit_reminder', { name: 'Kitap oku', time: '09:00' }),
        notification('n2', 'achievement_unlocked', { key: 'task_first' }, { read: true }),
      ]),
    );
    renderApp('/');

    const bell = await screen.findByRole('button', { name: 'Bildirimler, 1 okunmamış' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');

    const panel = screen.getByRole('region', { name: 'Bildirimler' });
    const rows = within(panel).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Kitap oku için zaman geldi (09:00).');
    expect(rows[0]).toHaveTextContent('Okunmamış');
    expect(rows[0]).toHaveTextContent('5 dakika önce');
    expect(rows[1]).toHaveTextContent('Yeni başarı: İlk görev.');
    expect(rows[1]).not.toHaveTextContent('Okunmamış');
    expect(within(panel).getByRole('link', { name: 'Bildirim ayarları' })).toHaveAttribute(
      'href',
      '/settings/notifications',
    );

    // Escape closes the panel and returns to the bell.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Bildirimler' })).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it('opens a notification: marks it as read and goes to what it is about', async () => {
    const apiMock = mockApi({
      ...notificationRoutes([
        notification(
          'n1',
          'goal_deadline',
          { title: 'Maraton', days: 3, date: '2026-11-27' },
          { entityType: 'goal', entityId: 'goal-1' },
        ),
      ]),
      'GET /goals/goal-1': () => fail(404, 'NOT_FOUND'),
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimler, 1 okunmamış' }));
    await userEvent.click(screen.getByRole('button', { name: /“Maraton” hedefine 3 gün kaldı/ }));

    await waitFor(() => expect(apiMock.calls('POST', '/notifications/n1/read')).toHaveLength(1));
    await waitFor(() => expect(apiMock.calls('GET', '/goals/goal-1').length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Bildirimler' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Bildirimler' })).toBeInTheDocument();
  });

  it('marks everything as read and deletes single notifications', async () => {
    const apiMock = mockApi(
      notificationRoutes([
        notification('n1', 'task_due', { title: 'Ara', time: '14:30' }),
        notification('n2', 'tasks_today', { due: 2, overdue: 1 }),
      ]),
    );
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimler, 2 okunmamış' }));
    const panel = screen.getByRole('region', { name: 'Bildirimler' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Tümünü okundu işaretle' }));
    await waitFor(() => expect(within(panel).queryByText('Okunmamış')).not.toBeInTheDocument());
    expect(apiMock.calls('POST', '/notifications/read-all')).toHaveLength(1);
    expect(within(panel).getByRole('button', { name: 'Tümünü okundu işaretle' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bildirimler' })).toBeInTheDocument();

    await userEvent.click(within(panel).getAllByRole('button', { name: 'Bildirimi sil' })[0]);
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(1));
    expect(apiMock.calls('DELETE', '/notifications/n1')).toHaveLength(1);
    expect(
      within(panel).getByText('Bugün için 2 görev var; 1 görev gecikmiş.'),
    ).toBeInTheDocument();
  });

  it('says so when there is nothing, and when the list cannot be loaded', async () => {
    mockApi(signedInRoutes());
    const view = renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
    expect(screen.getByText('Henüz bildirim yok')).toBeInTheDocument();
    view.unmount();

    mockApi({ ...signedInRoutes(), 'GET /notifications': () => fail(500, 'INTERNAL_ERROR') });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimler' }));
    expect(await screen.findByText('Bildirimler yüklenemedi.')).toBeInTheDocument();
  });
});
