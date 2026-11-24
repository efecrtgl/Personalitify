import { API_PREFIX, ERROR_CODES } from '@personalitify/shared-contracts';
import { ApiError, CLIENT_ERROR_CODES } from './errors.js';
import { createMemoryTokenStore } from './token-store.js';

/** Refresh shortly before expiry instead of waiting for a 401. */
const EXPIRY_MARGIN_MS = 20_000;

const SESSION_ENDING_CODES = new Set([
  ERROR_CODES.SESSION_REVOKED,
  ERROR_CODES.INVALID_REFRESH_TOKEN,
  ERROR_CODES.REFRESH_TOKEN_REUSED,
]);

function buildUrl(baseUrl, path, query) {
  let url = `${baseUrl}${API_PREFIX}${path}`;
  if (query) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        search.append(key, String(item));
      }
    }
    const text = search.toString();
    if (text) url += `?${text}`;
  }
  return url;
}

/**
 * Low-level transport: authentication header, language negotiation, token refresh with a
 * single retry, and conversion of every failure into an `ApiError`.
 *
 * @param {object}   options
 * @param {string}  [options.baseUrl]        Origin of the API, e.g. `https://api.example.com`.
 *                                           Empty for same-origin use.
 * @param {typeof fetch} [options.fetch]
 * @param {'include'|'omit'|'same-origin'} [options.credentials] `include` for browser clients
 *                                           that rely on the refresh cookie.
 * @param {object}  [options.tokenStore]     See `createMemoryTokenStore`.
 * @param {() => string} [options.getLanguage] Language sent as `Accept-Language`.
 * @param {(code: string) => void} [options.onSessionEnded] Called once when the session can
 *                                           no longer be refreshed.
 * @param {(task: () => Promise<any>) => Promise<any>} [options.refreshLock] Serializes refresh
 *                                           across execution contexts (browser tabs).
 */
export function createHttpClient({
  baseUrl = '',
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  credentials = 'same-origin',
  tokenStore = createMemoryTokenStore(),
  getLanguage,
  onSessionEnded,
  refreshLock = (task) => task(),
} = {}) {
  let refreshing = null;

  async function send(method, path, { body, query, signal, token } = {}) {
    const headers = { Accept: 'application/json' };
    const language = getLanguage?.();
    if (language) headers['Accept-Language'] = language;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path, query), {
        method,
        headers,
        credentials,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      const aborted = cause?.name === 'AbortError';
      throw new ApiError({
        code: aborted ? CLIENT_ERROR_CODES.ABORTED : CLIENT_ERROR_CODES.NETWORK_ERROR,
        message: cause?.message,
        cause,
      });
    }

    if (response.status === 204) return { data: null, meta: undefined };

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ApiError({
        status: response.status,
        code: CLIENT_ERROR_CODES.INVALID_RESPONSE,
        cause,
      });
    }

    if (!response.ok) {
      const error = payload?.error ?? {};
      throw new ApiError({
        status: response.status,
        code: error.code ?? CLIENT_ERROR_CODES.INVALID_RESPONSE,
        message: error.message,
        details: error.details,
        requestId: error.requestId,
      });
    }
    return { data: payload.data, meta: payload.meta };
  }

  function endSession(code) {
    const hadSession = tokenStore.getAccessToken() !== null;
    tokenStore.clear();
    if (hadSession) onSessionEnded?.(code);
  }

  /**
   * Exchanges the refresh token for a new token set. Concurrent callers share one request,
   * because a refresh token is single-use.
   */
  function refresh() {
    refreshing ??= refreshLock(async () => {
      const refreshToken = tokenStore.getRefreshToken();
      const { data } = await send('POST', '/auth/refresh', {
        body: refreshToken ? { refreshToken } : {},
      });
      tokenStore.setTokens(data);
      return data;
    }).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function refreshOrEnd() {
    try {
      return await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        endSession(error.code);
      }
      throw error;
    }
  }

  /**
   * Performs a request. Authenticated by default; pass `auth: false` for public endpoints.
   * Returns `{ data, meta }`.
   */
  async function request(method, path, { auth = true, ...options } = {}) {
    if (!auth) return send(method, path, options);

    const expiry = tokenStore.getAccessTokenExpiry?.();
    if (tokenStore.getAccessToken() && expiry && expiry - Date.now() < EXPIRY_MARGIN_MS) {
      await refreshOrEnd();
    }

    try {
      return await send(method, path, { ...options, token: tokenStore.getAccessToken() });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      if (SESSION_ENDING_CODES.has(error.code)) {
        endSession(error.code);
        throw error;
      }
      if (error.code !== ERROR_CODES.TOKEN_EXPIRED) throw error;

      await refreshOrEnd();
      return send(method, path, { ...options, token: tokenStore.getAccessToken() });
    }
  }

  /**
   * An access token that is valid for a while yet, refreshed first if it is about to
   * expire. For connections that authenticate outside of `request`, such as realtime.
   */
  async function getFreshAccessToken() {
    const expiry = tokenStore.getAccessTokenExpiry?.();
    if (tokenStore.getAccessToken() && expiry && expiry - Date.now() < EXPIRY_MARGIN_MS) {
      await refreshOrEnd();
    }
    return tokenStore.getAccessToken();
  }

  return {
    tokenStore,
    request,
    refresh: refreshOrEnd,
    getFreshAccessToken,
    get: async (path, options) => (await request('GET', path, options)).data,
    post: async (path, body, options) => (await request('POST', path, { ...options, body })).data,
    patch: async (path, body, options) => (await request('PATCH', path, { ...options, body })).data,
    put: async (path, body, options) => (await request('PUT', path, { ...options, body })).data,
    delete: async (path, body, options) =>
      (await request('DELETE', path, { ...options, body })).data,
    /** For paginated endpoints: returns `{ items, meta }`. */
    list: async (path, query, options) => {
      const { data, meta } = await request('GET', path, { ...options, query });
      return { items: data, meta };
    },
  };
}
