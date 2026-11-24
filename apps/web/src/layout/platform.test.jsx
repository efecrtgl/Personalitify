import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  account,
  anonymousRoutes,
  mockApi,
  noContent,
  ok,
  platformRoutes,
  renderApp,
  signedInRoutes,
} from '../test/harness.jsx';

const announcement = {
  id: 'maintenance-1',
  tone: 'warning',
  message: { tr: 'Pazar gecesi bakım yapılacak.', en: 'Maintenance on Sunday night.' },
};
const latest = (overrides = {}) => ({
  version: '0.2.0',
  channel: 'stable',
  notes: { tr: 'Daha hızlı açılış.', en: 'Faster start.' },
  downloadUrl: null,
  sha256: null,
  sizeBytes: null,
  publishedAt: '2026-11-24T09:00:00.000Z',
  ...overrides,
});

describe('announcement', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the message in the user’s language until it is dismissed', async () => {
    const apiMock = mockApi({
      ...signedInRoutes(),
      ...platformRoutes({ config: { announcement } }),
    });
    const view = renderApp('/');

    const banner = (await screen.findByText('Pazar gecesi bakım yapılacak.')).closest(
      '[role="status"]',
    );
    expect(within(banner).getByText('Duyuru')).toBeInTheDocument();
    // The client says which application and installation is asking.
    expect(apiMock.calls('GET', '/config')[0].query).toMatchObject({
      appId: 'personalitify-web',
      installationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });

    await userEvent.click(within(banner).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Pazar gecesi bakım yapılacak.')).not.toBeInTheDocument();

    // Dismissed for good in this browser …
    view.unmount();
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Pazar gecesi bakım yapılacak.')).not.toBeInTheDocument();
  });

  it('shows a new message again, and nothing when there is none', async () => {
    window.localStorage.setItem('pfy.dismissedAnnouncement', 'maintenance-1');
    mockApi({
      ...signedInRoutes(),
      ...platformRoutes({
        config: {
          announcement: { ...announcement, id: 'maintenance-2', tone: 'info' },
        },
      }),
    });
    const view = renderApp('/');
    expect(await screen.findByText('Pazar gecesi bakım yapılacak.')).toBeInTheDocument();
    view.unmount();

    mockApi(signedInRoutes());
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Duyuru')).not.toBeInTheDocument();
  });
});

describe('updates', () => {
  let reload;
  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers a newer version and reloads on request', async () => {
    const apiMock = mockApi({
      ...signedInRoutes(),
      ...platformRoutes({ update: { updateAvailable: true, latest: latest() } }),
    });
    renderApp('/');

    const banner = (await screen.findByText('Yeni bir sürüm hazır: 0.2.0')).closest(
      '[role="status"]',
    );
    expect(within(banner).getByText('Daha hızlı açılış.')).toBeInTheDocument();
    expect(apiMock.calls('GET', '/updates/check')[0].query).toMatchObject({
      appId: 'personalitify-web',
      platform: 'web',
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
    // The application stays usable; the update can wait.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

    await userEvent.click(within(banner).getByRole('button', { name: 'Şimdi yenile' }));
    expect(reload).toHaveBeenCalledTimes(1);
    await userEvent.click(within(banner).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Yeni bir sürüm hazır: 0.2.0')).not.toBeInTheDocument();
  });

  it('stops and asks for the update when the version is no longer supported', async () => {
    mockApi({
      ...signedInRoutes(),
      ...platformRoutes({
        update: {
          supported: false,
          mandatory: true,
          updateAvailable: true,
          minSupportedVersion: '0.2.0',
          latest: latest(),
        },
      }),
    });
    renderApp('/');

    const gate = await screen.findByRole('alertdialog', { name: 'Güncelleme gerekli' });
    expect(gate).toHaveTextContent('Bu sürüm artık desteklenmiyor.');
    expect(gate).toHaveTextContent('Yeni sürüm: 0.2.0');
    expect(gate).toHaveTextContent('Daha hızlı açılış.');
    // Nothing of the application is shown behind it.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await userEvent.click(within(gate).getByRole('button', { name: 'Şimdi yenile' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('carries on as usual when the server cannot be asked', async () => {
    const routes = signedInRoutes();
    delete routes['GET /config'];
    delete routes['GET /updates/check'];
    mockApi(routes);
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('closed registration', () => {
  it('hides the way to register and explains why on the page itself', async () => {
    mockApi({ ...anonymousRoutes(), ...platformRoutes({ config: { registrationOpen: false } }) });
    const view = renderApp('/login');
    await screen.findByRole('button', { name: 'Giriş yap' });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Hesap oluşturun' })).not.toBeInTheDocument(),
    );
    view.unmount();

    renderApp('/register');
    expect(
      await screen.findByRole('heading', { name: 'Kayıtlar şu anda kapalı' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');
  });

  it('offers registration while it is open', async () => {
    mockApi(anonymousRoutes());
    renderApp('/login');
    expect(await screen.findByRole('link', { name: /Hesap oluştur/ })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});

describe('administration', () => {
  const entries = (overrides = {}) => [
    {
      key: 'announcement',
      defaultValue: null,
      overridden: false,
      value: null,
      enabled: false,
      rolloutPercent: 100,
      appIds: [],
      description: '',
      updatedAt: null,
      ...overrides.announcement,
    },
    {
      key: 'registrationOpen',
      defaultValue: true,
      overridden: false,
      value: true,
      enabled: false,
      rolloutPercent: 100,
      appIds: [],
      description: '',
      updatedAt: null,
      ...overrides.registrationOpen,
    },
  ];
  const adminAccount = () => account({ user: { role: 'admin' } });
  const releaseRecord = (overrides = {}) => ({
    id: 'release-1',
    appId: 'personalitify-desktop',
    platform: 'windows',
    channel: 'stable',
    version: '1.2.0',
    minSupportedVersion: '1.0.0',
    mandatory: true,
    notes: { tr: '', en: '' },
    downloadUrl: null,
    sha256: null,
    sizeBytes: null,
    rolloutPercent: 50,
    published: false,
    publishedAt: null,
    createdAt: '2026-11-24T09:00:00.000Z',
    updatedAt: '2026-11-24T09:00:00.000Z',
    ...overrides,
  });

  it('is not offered to regular users', async () => {
    mockApi(signedInRoutes());
    renderApp('/settings/admin');
    // The address leads to the first ordinary section instead.
    const sections = await screen.findByRole('navigation', { name: 'Ayar bölümleri' });
    expect(within(sections).queryByRole('link', { name: 'Yönetim' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeInTheDocument();
  });

  it('publishes an announcement and closes registration', async () => {
    let stored = entries();
    const apiMock = mockApi({
      ...signedInRoutes(adminAccount()),
      'GET /admin/config': () => ok(stored),
      'GET /admin/releases': () => ok([]),
      'PUT /admin/config/announcement': ({ body }) => {
        stored = entries({
          announcement: { ...body, overridden: true, updatedAt: new Date().toISOString() },
        });
        return ok(stored[0]);
      },
      'PUT /admin/config/registrationOpen': ({ body }) => {
        stored = entries({ registrationOpen: { ...body, overridden: true, enabled: true } });
        return ok(stored[1]);
      },
    });
    renderApp('/settings/admin');

    const panel = (await screen.findByRole('heading', { name: 'Duyuru' })).closest('section');
    // Both languages are required.
    await userEvent.type(within(panel).getByLabelText('İleti (Türkçe)'), 'Bakım var.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Duyuruyu kaydet' }));
    expect(within(panel).getByRole('alert')).toHaveTextContent('İki dilde de bir ileti yazın.');
    expect(apiMock.calls('PUT', '/admin/config/announcement')).toHaveLength(0);

    await userEvent.type(within(panel).getByLabelText('İleti (İngilizce)'), 'Maintenance.');
    await userEvent.selectOptions(within(panel).getByLabelText('Tür'), 'warning');
    await userEvent.click(within(panel).getByRole('switch', { name: 'Duyuruyu göster' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Duyuruyu kaydet' }));
    await waitFor(() => expect(apiMock.calls('PUT', '/admin/config/announcement')).toHaveLength(1));
    const sent = apiMock.calls('PUT', '/admin/config/announcement')[0].body;
    expect(sent).toMatchObject({
      enabled: true,
      value: { tone: 'warning', message: { tr: 'Bakım var.', en: 'Maintenance.' } },
    });
    expect(sent.value.id).toMatch(/^announcement-\d+$/);
    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument();

    const registration = screen.getByRole('switch', { name: 'Yeni hesap oluşturulabilsin' });
    expect(registration).toBeChecked();
    await userEvent.click(registration);
    await waitFor(() =>
      expect(apiMock.calls('PUT', '/admin/config/registrationOpen')[0].body).toEqual({
        value: false,
      }),
    );
  });

  it('lists releases, publishes one, adds another and deletes', async () => {
    let releases = [releaseRecord()];
    const apiMock = mockApi({
      ...signedInRoutes(adminAccount()),
      'GET /admin/config': () => ok(entries()),
      'GET /admin/releases': () => ok(releases),
      'PATCH /admin/releases/release-1': ({ body }) => {
        releases = [releaseRecord({ ...body })];
        return ok(releases[0]);
      },
      'POST /admin/releases': ({ body }) => {
        releases = [releaseRecord({ id: 'release-2', ...body, notes: body.notes }), ...releases];
        return ok(releases[0]);
      },
      'DELETE /admin/releases/release-1': () => {
        releases = releases.filter((item) => item.id !== 'release-1');
        return noContent();
      },
    });
    renderApp('/settings/admin');

    const panel = (await screen.findByRole('heading', { name: 'Sürümler' })).closest('section');
    const row = (await within(panel).findByText('Masaüstü 1.2.0')).closest('li');
    expect(row).toHaveTextContent('Taslak');
    expect(row).toHaveTextContent('Zorunlu');
    expect(row).toHaveTextContent('Windows · Kararlı · %50 dağıtım · en az 1.0.0');

    await userEvent.click(within(row).getByRole('button', { name: '1.2.0 sürümünü yayımla' }));
    await waitFor(() =>
      expect(apiMock.calls('PATCH', '/admin/releases/release-1')[0].body).toEqual({
        published: true,
      }),
    );
    expect(await within(panel).findByText('Yayında')).toBeInTheDocument();

    // Add a release; the version must look like one.
    await userEvent.click(within(panel).getByRole('button', { name: 'Sürüm ekle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni sürüm' });
    await userEvent.type(within(dialog).getByLabelText('Sürüm'), '1.3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sürümü kaydet' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Sürüm 1.2.0 biçiminde olmalıdır.');
    expect(apiMock.calls('POST', '/admin/releases')).toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText('Sürüm'), '.0');
    await userEvent.selectOptions(within(dialog).getByLabelText('Platform'), 'macos');
    await userEvent.type(within(dialog).getByLabelText(/Sürüm notları \(Türkçe\)/), 'Yenilikler');
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Hemen yayımla' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sürümü kaydet' }));
    await waitFor(() => expect(apiMock.calls('POST', '/admin/releases')).toHaveLength(1));
    expect(apiMock.calls('POST', '/admin/releases')[0].body).toEqual({
      appId: 'personalitify-desktop',
      platform: 'macos',
      channel: 'stable',
      version: '1.3.0',
      minSupportedVersion: null,
      rolloutPercent: 100,
      downloadUrl: null,
      notes: { tr: 'Yenilikler', en: '' },
      mandatory: false,
      published: true,
    });
    expect(await within(panel).findByText('Masaüstü 1.3.0')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: '1.2.0 sürümünü sil' }));
    expect(await screen.findByText('Sürüm silindi')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).queryByText('Masaüstü 1.2.0')).not.toBeInTheDocument(),
    );
  });
});
