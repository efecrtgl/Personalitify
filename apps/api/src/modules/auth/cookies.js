import { API_PREFIX } from '@personalitify/shared-contracts';
import { getConfig } from '../../config/env.js';

export const REFRESH_COOKIE = 'pfy_refresh';

/** The cookie is only ever sent to the authentication endpoints. */
const COOKIE_PATH = `${API_PREFIX}/auth`;

function baseOptions() {
  return {
    httpOnly: true,
    secure: getConfig().auth.cookieSecure,
    sameSite: 'strict',
    path: COOKIE_PATH,
  };
}

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(), expires: new Date(expiresAt) });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function readRefreshCookie(req) {
  const header = req.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === REFRESH_COOKIE) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
