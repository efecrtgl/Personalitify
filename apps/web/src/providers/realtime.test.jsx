import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyDashboard,
  fail,
  mockApi,
  noContent,
  ok,
  renderApp,
  signedInRoutes,
} from '../test/harness.jsx';

/** A stand-in for the live connection that lets a test play the server. */
function fakeRealtime() {
  const connections = [];
  const connect = vi.fn((options) => {
    const connection = {
      options,
      connected: false,
      connect: vi.fn(() => {
        connection.connected = true;
        options.onStatus?.('connected');
      }),
      disconnect: vi.fn(() => {
        connection.connected = false;
      }),
    };
    connections.push(connection);
    return connection;
  });
  return { connect, connections };
}

const event = (entityType, action, data = {}) => ({
  eventId: `event-${Math.random()}`,
  event: `${entityType}.${action}`,
  seq: 1,
  userId: 'user-1',
  entityType,
  entityId: data.id ?? 'entity-1',
  entityVersion: 1,
  originDeviceId: 'another-device',
  changedFields: [],
  data,
});

describe('realtime', () => {
  it('connects once signed in, with a current access token', async () => {
    mockApi(signedInRoutes());
    const realtime = fakeRealtime();
    renderApp('/', { realtime: realtime.connect });

    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(realtime.connections).toHaveLength(1));
    const [connection] = realtime.connections;
    expect(connection.connect).toHaveBeenCalledTimes(1);
    expect(await connection.options.getToken()).toBe('access-token');
  });

  it('does not connect for a visitor who is not signed in', async () => {
    mockApi({ 'POST /auth/refresh': () => fail(401, 'INVALID_REFRESH_TOKEN') });
    const realtime = fakeRealtime();
    renderApp('/login', { realtime: realtime.connect });
    await screen.findByRole('button', { name: 'Giriş yap' });
    expect(realtime.connect).not.toHaveBeenCalled();
  });

  it('refreshes what a change from another device affects', async () => {
    let done = 0;
    const apiMock = mockApi({
      ...signedInRoutes(),
      'GET /dashboard': () =>
        ok(
          emptyDashboard({
            tasks: {
              summary: { total: 3, done, overdue: 0, open: 3 - done },
              overdue: [],
              due: [],
              completed: [],
            },
          }),
        ),
    });
    const realtime = fakeRealtime();
    renderApp('/', { realtime: realtime.connect });

    expect(await screen.findByText('0 / 3')).toBeInTheDocument();
    await waitFor(() => expect(realtime.connections).toHaveLength(1));
    const before = apiMock.calls('GET', '/dashboard').length;

    // A task is finished on the phone.
    done = 1;
    realtime.connections[0].options.onEvent(event('task', 'updated', { id: 'task-1' }));
    expect(await screen.findByText('1 / 3')).toBeInTheDocument();
    expect(apiMock.calls('GET', '/dashboard').length).toBe(before + 1);

    // An event about something this screen does not show leaves it alone.
    realtime.connections[0].options.onEvent(event('journalEntry', 'updated', { id: 'entry-1' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(apiMock.calls('GET', '/dashboard').length).toBe(before + 1);

    // After a long absence everything is reloaded.
    done = 2;
    realtime.connections[0].options.onReset();
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
  });

  it('announces a new notification and updates the bell', async () => {
    let items = [];
    mockApi({
      ...signedInRoutes(),
      'GET /notifications': () =>
        ok(items, {
          page: 1,
          limit: 20,
          total: items.length,
          totalPages: 1,
          unread: items.filter((item) => !item.read).length,
        }),
    });
    const realtime = fakeRealtime();
    renderApp('/', { realtime: realtime.connect });
    await screen.findByRole('button', { name: 'Bildirimler' });
    await waitFor(() => expect(realtime.connections).toHaveLength(1));

    const notification = {
      id: 'n1',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      kind: 'habit_reminder',
      params: { name: 'Kitap oku', time: '09:00' },
      entityType: 'habit',
      entityId: 'habit-1',
      silent: false,
      read: false,
      readAt: null,
    };
    items = [notification];
    realtime.connections[0].options.onEvent(event('notification', 'created', notification));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Kitap oku için zaman geldi (09:00).',
    );
    expect(
      await screen.findByRole('button', { name: 'Bildirimler, 1 okunmamış' }),
    ).toBeInTheDocument();

    // One made during quiet hours reaches the bell without interrupting.
    const quiet = {
      ...notification,
      id: 'n2',
      silent: true,
      params: { name: 'Su iç', time: '23:00' },
    };
    items = [quiet, notification];
    realtime.connections[0].options.onEvent(event('notification', 'created', quiet));
    expect(
      await screen.findByRole('button', { name: 'Bildirimler, 2 okunmamış' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Su iç için zaman geldi (23:00).')).not.toBeInTheDocument();
  });

  it('closes the connection when the user signs out', async () => {
    mockApi({ ...signedInRoutes(), 'POST /auth/logout': () => noContent() });
    const realtime = fakeRealtime();
    renderApp('/', { realtime: realtime.connect });
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(realtime.connections).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: /Hesap menüsü|Ada/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Çıkış yap' }));
    await waitFor(() => expect(realtime.connections[0].disconnect).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });
});
