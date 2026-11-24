import { ERROR_CODES } from '@personalitify/shared-contracts';
import { forbidden, unauthenticated } from '../core/errors.js';
import { verifyAccessToken } from '../modules/auth/access-token.js';
import { findActiveSession } from '../modules/auth/session.service.js';
import { touchDevice } from '../modules/devices/devices.service.js';

/**
 * Resolves the caller from a bearer token and returns `{ userId, sessionId, deviceId, role }`.
 * The session is looked up on every call, so revoking a session takes effect immediately
 * rather than when the access token expires.
 */
export async function resolveAuth(token) {
  if (!token) throw unauthenticated();
  const claims = await verifyAccessToken(token);
  const session = await findActiveSession(claims.sessionId);
  if (!session || session.userId !== claims.userId) {
    throw unauthenticated(ERROR_CODES.SESSION_REVOKED);
  }
  return claims;
}

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Express middleware that requires an authenticated caller, optionally with a role. */
export function authenticate({ role } = {}) {
  return async (req, res, next) => {
    req.auth = await resolveAuth(bearerToken(req));
    if (role && req.auth.role !== role) {
      throw forbidden();
    }
    touchDevice(req.auth.deviceId);
    next();
  };
}
