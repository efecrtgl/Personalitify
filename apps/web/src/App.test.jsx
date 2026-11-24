import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  account,
  anonymousRoutes,
  fail,
  mockApi,
  ok,
  renderApp,
  signedInRoutes,
  tokens,
} from './test/harness.jsx';
import { setSystemDark } from './test/setup.js';

describe('visitors', () => {
  it('are sent to the sign-in screen, in Turkish by default', async () => {
    mockApi(anonymousRoutes());
    renderApp('/settings/profile');

    expect(await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('tr');
  });

  it('can switch the language before signing in, and the choice is remembered', async () => {
    const user = userEvent.setup();
    mockApi(anonymousRoutes());
    const view = renderApp('/login');
    await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' });

    await user.click(screen.getByRole('button', { name: 'Dil' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('pfy.language')).toBe('en');

    // A later visit starts in the remembered language.
    view.unmount();
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('see field errors before anything is sent to the server', async () => {
    const user = userEvent.setup();
    const api = mockApi(anonymousRoutes());
    renderApp('/login');

    await user.type(await screen.findByLabelText('E-posta'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(screen.getByText('Geçerli bir e-posta adresi girin.')).toBeInTheDocument();
    expect(screen.getByText('Bu alan zorunludur.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls('POST', '/auth/login')).toHaveLength(0);
  });

  it('see the server’s message when the credentials are wrong', async () => {
    const user = userEvent.setup();
    mockApi({
      ...anonymousRoutes(),
      'POST /auth/login': () => fail(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı.'),
    });
    renderApp('/login');

    await user.type(await screen.findByLabelText('E-posta'), 'ada@example.test');
    await user.type(screen.getByLabelText('Parola'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-posta veya parola hatalı.');
  });
});

describe('signing in', () => {
  it('registers this browser as a web device and applies the account’s language', async () => {
    const user = userEvent.setup();
    const me = account({ settings: { language: 'en' }, profile: { displayName: 'Ada' } });
    const api = mockApi({
      ...anonymousRoutes(),
      'POST /auth/login': () => ok({ tokens: tokens(), ...me }),
      'GET /users/me': () => ok(me),
    });
    renderApp('/login');

    await user.type(await screen.findByLabelText('E-posta'), 'ada@example.test');
    await user.type(screen.getByLabelText('Parola'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Giriş yap' }));

    // The account is set to English, so the interface follows it.
    expect(await screen.findByRole('heading', { name: /^Good \w+, Ada$/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();

    const [login] = api.calls('POST', '/auth/login');
    expect(login.body).toMatchObject({
      email: 'ada@example.test',
      device: { clientType: 'web', platform: 'web', appId: 'personalitify-web' },
    });
    expect(login.body.device.installationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(window.localStorage.getItem('pfy.installationId')).toBe(
      login.body.device.installationId,
    );
  });

  it('creates an account with the browser’s language and time zone', async () => {
    const user = userEvent.setup();
    const me = account({ user: { emailVerified: false } });
    const api = mockApi({
      ...anonymousRoutes(),
      'POST /auth/register': () => ok({ tokens: tokens(), ...me }),
      'GET /users/me': () => ok(me),
    });
    renderApp('/register');

    await user.type(await screen.findByLabelText('Adınız'), '  Ada  ');
    await user.type(screen.getByLabelText('E-posta'), 'ada@example.test');
    await user.type(screen.getByLabelText('Parola'), 'short');
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }));
    expect(screen.getByText('En az 8 karakter olmalıdır.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Parola'), ' but long enough');
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }));

    // The new account has not confirmed its email yet.
    expect(await screen.findByText('E-posta adresinizi doğrulayın')).toBeInTheDocument();
    const [request] = api.calls('POST', '/auth/register');
    expect(request.body).toMatchObject({ displayName: 'Ada', language: 'tr' });
    expect(request.headers['Accept-Language']).toBe('tr');
  });
});

describe('a returning user', () => {
  it('is restored from the refresh cookie without signing in again', async () => {
    const api = mockApi(signedInRoutes());
    renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: /Ada$/ })).toBeInTheDocument();
    const [refresh] = api.calls('POST', '/auth/refresh');
    expect(refresh.body).toEqual({});
    expect(api.calls('GET', '/users/me')[0].headers.Authorization).toBe('Bearer access-token');
  });

  it('gets a retry when the server cannot be reached', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuyla bağlantı yok');

    const me = account();
    mockApi(signedInRoutes(me));
    await user.click(screen.getByRole('button', { name: 'Yeniden dene' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Ada$/ })).toBeInTheDocument();
  });

  it('is returned to the sign-in screen when the session is revoked elsewhere', async () => {
    const user = userEvent.setup();
    mockApi({
      ...signedInRoutes(),
      'GET /auth/sessions': () => fail(401, 'SESSION_REVOKED', 'Bu oturum kapatılmış.'),
      'GET /account/security-log': () => fail(401, 'SESSION_REVOKED', 'Bu oturum kapatılmış.'),
    });
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Ada$/ });

    // Open the security settings, whose requests are answered with "session revoked".
    await user.click(screen.getByRole('link', { name: 'Ayarlar' }));
    await user.click(await screen.findByRole('link', { name: 'Güvenlik' }));

    expect(await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeInTheDocument();
    expect(screen.getByText(/Oturumunuz kapatıldı/)).toBeInTheDocument();
  });

  it('signs out from the account menu', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      ...signedInRoutes(),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Ada$/ });

    await user.click(screen.getByRole('button', { name: 'Hesap menüsü' }));
    await user.click(screen.getByRole('menuitem', { name: 'Çıkış yap' }));

    expect(await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' })).toBeInTheDocument();
    expect(api.calls('POST', '/auth/logout')).toHaveLength(1);
  });

  it('sees a not-found page for unknown addresses', async () => {
    mockApi(signedInRoutes());
    renderApp('/no-such-page');
    expect(await screen.findByRole('heading', { name: 'Sayfa bulunamadı' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana sayfaya dön' })).toHaveAttribute('href', '/');
  });
});

describe('theme', () => {
  it('follows the system until the user chooses, then persists the choice', async () => {
    const user = userEvent.setup();
    mockApi(anonymousRoutes());
    const view = renderApp('/login');
    await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' });
    expect(document.documentElement.dataset.theme).toBe('light');

    setSystemDark(true);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    await user.click(screen.getByRole('button', { name: 'Tema' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Açık' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('pfy.theme')).toBe('light');

    // The explicit choice survives a reload and no longer follows the system.
    view.unmount();
    delete document.documentElement.dataset.theme;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Tekrar hoş geldiniz' });
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('stores the theme in the account so other devices receive it', async () => {
    const user = userEvent.setup();
    const me = account();
    const api = mockApi({
      ...signedInRoutes(me),
      'PATCH /settings': ({ body }) => ok({ ...me.settings, theme: body.theme, version: 2 }),
    });
    renderApp('/settings/appearance');

    const themes = await screen.findByRole('radiogroup', { name: 'Tema' });
    await user.click(within(themes).getByRole('radio', { name: 'Koyu' }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(() => expect(api.calls('PATCH', '/settings')).toHaveLength(1));
    expect(api.calls('PATCH', '/settings')[0].body).toEqual({ theme: 'dark', baseVersion: 1 });
    expect(within(themes).getByRole('radio', { name: 'Koyu' })).toBeChecked();
  });

  it('applies the theme saved in the account when signing in on a new device', async () => {
    mockApi(signedInRoutes(account({ settings: { theme: 'dark' } })));
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Ada$/ });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(window.localStorage.getItem('pfy.theme')).toBe('dark');
  });
});
