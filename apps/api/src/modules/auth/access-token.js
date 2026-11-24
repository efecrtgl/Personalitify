import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@personalitify/shared-contracts';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { getConfig } from '../../config/env.js';
import { unauthenticated } from '../../core/errors.js';

const ISSUER = 'personalitify';
const AUDIENCE = 'personalitify-api';
const ALGORITHM = 'HS256';

let secretKey;
function key() {
  if (!secretKey) {
    secretKey = new TextEncoder().encode(getConfig().auth.accessSecret);
  }
  return secretKey;
}

/**
 * Issues a short-lived access token.
 * Claims: `sub` user id, `sid` session id, `did` device id, `role`.
 */
export async function signAccessToken({ userId, sessionId, deviceId, role }) {
  const ttl = getConfig().auth.accessTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const token = await new SignJWT({ sid: sessionId, did: deviceId, role })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
  return { token, expiresIn: ttl, expiresAt };
}

/** Verifies signature, issuer, audience and expiry. Throws a 401 AppError otherwise. */
export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });
    if (!payload.sub || !payload.sid || !payload.did) {
      throw unauthenticated();
    }
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      deviceId: payload.did,
      role: payload.role ?? 'user',
      // When the token stops being valid; long-lived connections end with it.
      expiresAt: new Date(payload.exp * 1000),
    };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw unauthenticated(ERROR_CODES.TOKEN_EXPIRED);
    }
    throw unauthenticated();
  }
}
