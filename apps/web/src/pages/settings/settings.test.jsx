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

const device = (overrides = {}) => ({
  id: 'device-1',
  installationId: 'installation-1',
  name: 'Chrome · Windows',
  clientType: 'web',
  platform: 'web',
  appId: 'personalitify-web',
  appVersion: '0.1.0',
  osVersion: null,
  lastSeenAt: new Date().toISOString(),
  syncCursor: 0,
  lastSyncAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  current: true,
  ...overrides,
});

describe('settings', () => {
  it('opens on the profile section and lists every section', async () => {
    mockApi(signedInRoutes());
    renderApp('/settings');
    const sections = await screen.findByRole('navigation', { name: 'Ayar bölümleri' });
    expect(
      within(sections)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Profil',
      'Görünüm',
      'Tarih ve saat',
      'Bildirimler',
      'Gizlilik',
      'Güvenlik',
      'Cihazlar',
      'Hesap',
    ]);
    expect(within(sections).getByRole('link', { name: 'Profil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('saves the profile with the version it was based on', async () => {
    const user = userEvent.setup();
    const me = account({ profile: { version: 4 } });
    const api = mockApi({
      ...signedInRoutes(me),
      'PATCH /users/me/profile': ({ body }) =>
        ok({ ...me.profile, ...body, baseVersion: undefined, version: 5 }),
    });
    renderApp('/settings/profile');

    const name = await screen.findByLabelText('Ad');
    const save = screen.getByRole('button', { name: 'Kaydet' });
    expect(save).toBeDisabled();

    await user.clear(name);
    await user.type(name, 'Ada Lovelace');
    await user.click(screen.getByRole('radio', { name: 'Mor' }));
    await user.click(save);

    await waitFor(() => expect(api.calls('PATCH', '/users/me/profile')).toHaveLength(1));
    expect(api.calls('PATCH', '/users/me/profile')[0].body).toEqual({
      displayName: 'Ada Lovelace',
      bio: '',
      avatarColor: '#bf5af2',
      baseVersion: 4,
    });
    expect(await screen.findByText('Değişiklikler kaydedildi')).toBeInTheDocument();
  });

  it('shows the server’s field errors next to the fields', async () => {
    const user = userEvent.setup();
    mockApi({
      ...signedInRoutes(),
      'PATCH /users/me/profile': () =>
        fail(400, 'VALIDATION_FAILED', 'Geçersiz', [
          {
            path: 'displayName',
            code: 'too_big_string',
            message: 'En fazla 60 karakter olabilir.',
          },
        ]),
    });
    renderApp('/settings/profile');
    await user.type(await screen.findByLabelText('Ad'), ' Lovelace');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('En fazla 60 karakter olabilir.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ad')).toHaveAttribute('aria-invalid', 'true');
  });

  it('updates a notification preference optimistically and rolls back on failure', async () => {
    const user = userEvent.setup();
    const me = account();
    let attempt = 0;
    const api = mockApi({
      ...signedInRoutes(me),
      'PATCH /settings': ({ body }) => {
        attempt += 1;
        if (attempt === 1) {
          return ok({
            ...me.settings,
            version: 2,
            notifications: { ...me.settings.notifications, ...body.notifications },
          });
        }
        return fail(500, 'INTERNAL_ERROR', 'Bizden kaynaklanan bir sorun oluştu.');
      },
    });
    renderApp('/settings/notifications');

    const tasks = await screen.findByRole('switch', { name: 'Görev hatırlatıcıları' });
    await user.click(tasks);
    expect(tasks).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(api.calls('PATCH', '/settings')).toHaveLength(1));
    expect(api.calls('PATCH', '/settings')[0].body).toEqual({
      notifications: { taskReminders: false },
      baseVersion: 1,
    });

    // The next change is based on the version the server returned, and fails.
    const goals = screen.getByRole('switch', { name: 'Hedef hatırlatıcıları' });
    await user.click(goals);
    await waitFor(() => expect(api.calls('PATCH', '/settings')).toHaveLength(2));
    expect(api.calls('PATCH', '/settings')[1].body.baseVersion).toBe(2);
    expect(await screen.findByRole('alert')).toHaveTextContent('Bizden kaynaklanan bir sorun');
    await waitFor(() => expect(goals).toHaveAttribute('aria-checked', 'true'));
    expect(tasks).toHaveAttribute('aria-checked', 'false');
  });

  it('reloads the server state when another device changed the same setting', async () => {
    const user = userEvent.setup();
    const me = account();
    const newer = account({ settings: { version: 7, weekStart: 7 } });
    let serverState = me;
    mockApi({
      'POST /auth/refresh': signedInRoutes()['POST /auth/refresh'],
      'GET /users/me': () => ok(serverState),
      'PATCH /settings': () => {
        serverState = newer;
        return fail(409, 'VERSION_CONFLICT', 'Bu kayıt başka bir yerde değiştirildi.');
      },
    });
    renderApp('/settings/region');

    const weekStart = await screen.findByRole('combobox', { name: 'Haftanın ilk günü' });
    await user.selectOptions(weekStart, '6');

    expect(await screen.findByText(/başka bir cihazda değiştirildi/)).toBeInTheDocument();
    await waitFor(() => expect(weekStart).toHaveValue('7'));
  });

  it('shows how far each device has followed the account', async () => {
    mockApi({
      ...signedInRoutes(),
      'GET /devices': () =>
        ok([
          device({ syncCursor: 120, lastSyncAt: new Date().toISOString() }),
          device({
            id: 'device-2',
            name: 'Telefon',
            clientType: 'mobile',
            current: false,
            syncCursor: 97,
            lastSyncAt: '2026-11-20T09:00:00.000Z',
          }),
          device({ id: 'device-3', name: 'Eski tablet', current: false }),
        ]),
      'GET /sync/status': () =>
        ok({
          headSeq: 120,
          oldestCursor: 0,
          retentionDays: 90,
          device: { id: 'device-1', cursor: 120, lastSyncAt: null, behind: 0, canCatchUp: true },
        }),
    });
    renderApp('/settings/devices');

    const row = async (name) => (await screen.findByText(name)).closest('li');
    expect(await row('Chrome · Windows')).toHaveTextContent('Eşitleme: güncel');
    expect(await row('Telefon')).toHaveTextContent('Eşitleme: 23 değişiklik geride');
    expect(await row('Eski tablet')).toHaveTextContent('Bu cihaz henüz eşitlenmedi');
  });

  it('lists devices, renames one and removes another after confirmation', async () => {
    const user = userEvent.setup();
    let devices = [
      device(),
      device({ id: 'device-2', name: 'Telefon', clientType: 'mobile', current: false }),
    ];
    const api = mockApi({
      ...signedInRoutes(),
      'GET /devices': () => ok(devices),
      'PATCH /devices/device-1': ({ body }) => {
        devices = devices.map((d) => (d.id === 'device-1' ? { ...d, ...body } : d));
        return ok(devices[0]);
      },
      'DELETE /devices/device-2': () => {
        devices = devices.filter((d) => d.id !== 'device-2');
        return noContent();
      },
    });
    renderApp('/settings/devices');

    expect(await screen.findByText('Telefon')).toBeInTheDocument();
    expect(screen.getByText('Bu cihaz')).toBeInTheDocument();
    // The current device cannot remove itself.
    expect(screen.queryByRole('button', { name: /Chrome · Windows cihazını kaldır/ })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Chrome · Windows cihazını yeniden adlandır/ }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cihazı yeniden adlandır' });
    const field = within(dialog).getByLabelText('Cihaz adı');
    await user.clear(field);
    await user.type(field, 'Çalışma bilgisayarı{Enter}');
    expect(await screen.findByText('Çalışma bilgisayarı')).toBeInTheDocument();
    expect(api.calls('PATCH', '/devices/device-1')[0].body).toEqual({
      name: 'Çalışma bilgisayarı',
    });

    await user.click(screen.getByRole('button', { name: /Telefon cihazını kaldır/ }));
    await user.click(screen.getByRole('button', { name: 'Cihazı kaldır' }));
    await waitFor(() => expect(screen.queryByText('Telefon')).not.toBeInTheDocument());
    expect(api.calls('DELETE', '/devices/device-2')).toHaveLength(1);
  });

  it('requires the password to delete the account and explains a wrong one', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const api = mockApi({
      ...signedInRoutes(),
      'DELETE /account': () => {
        attempts += 1;
        return attempts === 1 ? fail(400, 'INVALID_CREDENTIALS', 'Hatalı') : noContent();
      },
    });
    renderApp('/settings/account');

    await user.click(await screen.findByRole('button', { name: 'Hesabımı sil' }));
    const dialog = screen.getByRole('dialog', { name: 'Hesabınız silinsin mi?' });
    await user.click(within(dialog).getByRole('button', { name: 'Kalıcı olarak sil' }));
    expect(within(dialog).getByText('Bu alan zorunludur.')).toBeInTheDocument();
    expect(api.calls('DELETE', '/account')).toHaveLength(0);

    const password = within(dialog).getByLabelText('Onaylamak için parolanızı girin');
    await user.type(password, 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Kalıcı olarak sil' }));
    expect(await within(dialog).findByText('Mevcut parola hatalı.')).toBeInTheDocument();

    await user.clear(password);
    await user.type(password, 'correct horse battery');
    await user.click(within(dialog).getByRole('button', { name: 'Kalıcı olarak sil' }));
    expect(await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeInTheDocument();
    expect(api.calls('DELETE', '/account')[1].body).toEqual({ password: 'correct horse battery' });
  });
});
