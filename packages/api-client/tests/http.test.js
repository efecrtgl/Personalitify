import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, createMemoryTokenStore } from '../src/index.js';

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const tokenSet = (name, overrides = {}) => ({
  accessToken: `access-${name}`,
  accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  refreshToken: `refresh-${name}`,
  sessionId: 'session-1',
  deviceId: 'device-1',
  ...overrides,
});

const expired = () =>
  json(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired', requestId: 'r1' } });

/** A scripted fetch: each call takes the next handler. */
function scriptedFetch(...handlers) {
  const calls = [];
  const fetch = vi.fn(async (url, init) => {
    const call = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);
    const handler = handlers.shift();
    if (!handler) throw new Error(`unexpected request ${init.method} ${url}`);
    return handler(call);
  });
  return { fetch, calls };
}

function signedInClient(fetch, options = {}) {
  const tokenStore = createMemoryTokenStore();
  tokenStore.setTokens(tokenSet('one'));
  return createApiClient({ fetch, tokenStore, getLanguage: () => 'en', ...options });
}

describe('api client transport', () => {
  it('sends the bearer token, language and JSON body to the versioned path', async () => {
    const { fetch, calls } = scriptedFetch(() => json(200, { data: { theme: 'dark' } }));
    const api = signedInClient(fetch, { baseUrl: 'https://api.example.test' });

    const result = await api.settings.update({ theme: 'dark', baseVersion: 2 });

    expect(result).toEqual({ theme: 'dark' });
    expect(calls[0]).toMatchObject({
      url: 'https://api.example.test/api/v1/settings',
      method: 'PATCH',
      body: { theme: 'dark', baseVersion: 2 },
    });
    expect(calls[0].headers).toMatchObject({
      Authorization: 'Bearer access-one',
      'Accept-Language': 'en',
      'Content-Type': 'application/json',
    });
  });

  it('does not authenticate public endpoints', async () => {
    const { fetch, calls } = scriptedFetch(() => json(200, { data: { status: 'ok' } }));
    const api = signedInClient(fetch);
    await api.health.get();
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it('serializes query parameters and returns pagination metadata', async () => {
    const { fetch, calls } = scriptedFetch(() =>
      json(200, { data: [{ id: 'a' }], meta: { page: 2, limit: 1, total: 5, totalPages: 5 } }),
    );
    const api = signedInClient(fetch);
    const page = await api.account.securityLog({ page: 2, limit: 1, unused: undefined });
    expect(calls[0].url).toBe('/api/v1/account/security-log?page=2&limit=1');
    expect(page).toEqual({ items: [{ id: 'a' }], meta: expect.objectContaining({ total: 5 }) });
  });

  it('turns API failures into ApiError with field errors', async () => {
    const { fetch } = scriptedFetch(() =>
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Not valid.',
          details: [
            { path: 'email', code: 'invalid_email', message: 'Enter a valid email address.' },
            { path: 'email', code: 'too_big_string', message: 'Too long.' },
          ],
          requestId: 'req-9',
        },
      }),
    );
    const api = createApiClient({ fetch });
    const error = await api.auth.forgotPassword('nope').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'Not valid.',
      requestId: 'req-9',
    });
    expect(error.fieldErrors).toEqual({ email: 'Enter a valid email address.' });
  });

  it('reports network failures and unreadable responses with client codes', async () => {
    const offline = createApiClient({
      fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    });
    const networkError = await offline.health.get().catch((caught) => caught);
    expect(networkError).toMatchObject({ code: 'NETWORK_ERROR', status: 0, isNetworkError: true });

    const broken = createApiClient({
      fetch: vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })),
    });
    await expect(broken.health.get()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('returns null for 204 responses', async () => {
    const { fetch } = scriptedFetch(() => new Response(null, { status: 204 }));
    await expect(signedInClient(fetch).auth.resendVerification()).resolves.toBeNull();
  });
});

describe('token refresh', () => {
  it('refreshes once after TOKEN_EXPIRED and retries with the new token', async () => {
    const { fetch, calls } = scriptedFetch(
      expired,
      () => json(200, { data: tokenSet('two') }),
      () => json(200, { data: { user: { id: 'u1' } } }),
    );
    const api = signedInClient(fetch);

    await expect(api.users.me()).resolves.toEqual({ user: { id: 'u1' } });

    expect(calls.map((call) => call.url)).toEqual([
      '/api/v1/users/me',
      '/api/v1/auth/refresh',
      '/api/v1/users/me',
    ]);
    expect(calls[1].body).toEqual({ refreshToken: 'refresh-one' });
    expect(calls[2].headers.Authorization).toBe('Bearer access-two');
    expect(api.tokenStore.getRefreshToken()).toBe('refresh-two');
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshCalls = 0;
    const fetch = vi.fn(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(200, { data: tokenSet('two') });
      }
      return init.headers.Authorization === 'Bearer access-two'
        ? json(200, { data: { ok: true } })
        : expired();
    });
    const api = signedInClient(fetch);

    const results = await Promise.all([api.users.me(), api.settings.get(), api.devices.list()]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('refreshes ahead of time when the access token is about to expire', async () => {
    const { fetch, calls } = scriptedFetch(
      () => json(200, { data: tokenSet('two') }),
      () => json(200, { data: { ok: true } }),
    );
    const tokenStore = createMemoryTokenStore();
    tokenStore.setTokens(
      tokenSet('one', { accessTokenExpiresAt: new Date(Date.now() + 5000).toISOString() }),
    );
    const api = createApiClient({ fetch, tokenStore });

    await api.users.me();
    expect(calls.map((call) => call.url)).toEqual(['/api/v1/auth/refresh', '/api/v1/users/me']);
  });

  it('sends an empty body and relies on the cookie when no refresh token is held', async () => {
    const { fetch, calls } = scriptedFetch(() =>
      json(200, { data: tokenSet('web', { refreshToken: null }) }),
    );
    const api = createApiClient({ fetch, credentials: 'include' });

    await api.auth.refresh();
    expect(calls[0]).toMatchObject({ body: {}, credentials: 'include' });
    expect(api.tokenStore.getAccessToken()).toBe('access-web');
    expect(api.tokenStore.getRefreshToken()).toBeNull();
  });

  it('ends the session exactly once when the refresh token is rejected', async () => {
    const onSessionEnded = vi.fn();
    const { fetch } = scriptedFetch(expired, () =>
      json(401, { error: { code: 'REFRESH_TOKEN_REUSED', message: 'closed' } }),
    );
    const api = signedInClient(fetch, { onSessionEnded });

    await expect(api.users.me()).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledWith('REFRESH_TOKEN_REUSED');
    expect(api.tokenStore.getAccessToken()).toBeNull();
  });

  it('ends the session when the server reports it as revoked', async () => {
    const onSessionEnded = vi.fn();
    const { fetch, calls } = scriptedFetch(() =>
      json(401, { error: { code: 'SESSION_REVOKED', message: 'signed out' } }),
    );
    const api = signedInClient(fetch, { onSessionEnded });

    await expect(api.users.me()).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(calls).toHaveLength(1);
    expect(onSessionEnded).toHaveBeenCalledWith('SESSION_REVOKED');
  });

  it('keeps the session when refreshing fails for a transient reason', async () => {
    const onSessionEnded = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(expired())
      .mockRejectedValueOnce(new TypeError('offline'));
    const api = signedInClient(fetch, { onSessionEnded });

    await expect(api.users.me()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(api.tokenStore.getAccessToken()).toBe('access-one');
  });

  it('runs the refresh inside the provided lock', async () => {
    const order = [];
    const refreshLock = async (task) => {
      order.push('lock acquired');
      const result = await task();
      order.push('lock released');
      return result;
    };
    const { fetch } = scriptedFetch(() => {
      order.push('refresh request');
      return json(200, { data: tokenSet('two') });
    });
    await signedInClient(fetch, { refreshLock }).auth.refresh();
    expect(order).toEqual(['lock acquired', 'refresh request', 'lock released']);
  });

  it('stores tokens on login and clears them on logout even if the request fails', async () => {
    const { fetch } = scriptedFetch(
      () => json(200, { data: { tokens: tokenSet('login'), user: { id: 'u1' } } }),
      () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    );
    const api = createApiClient({ fetch });

    await api.auth.login({ email: 'a@b.co', password: 'x', device: {} });
    expect(api.tokenStore.getAccessToken()).toBe('access-login');

    await expect(api.auth.logout()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(api.tokenStore.getAccessToken()).toBeNull();
  });
});
