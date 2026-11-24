import { ERROR_CODES } from '@personalitify/shared-contracts';
import { getConfig } from '../../config/env.js';
import { generateToken, hashToken } from '../../core/crypto.js';
import { notFound, unauthenticated } from '../../core/errors.js';
import { registerUserCollection } from '../../core/user-data.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { Device } from '../devices/device.model.js';
import { Session, serializeSession } from './session.model.js';

registerUserCollection({ key: 'sessions', model: Session });

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a finished session stays visible before MongoDB removes it. */
const PURGE_AFTER_MS = 30 * DAY_MS;
/**
 * Two requests that race with the same refresh token (for example a retry after a dropped
 * response) are not an attack. Within this window the loser is rejected without closing the
 * session.
 */
const REUSE_GRACE_MS = 10_000;

function lifetimes(now = Date.now()) {
  const expiresAt = new Date(now + getConfig().auth.refreshTtlDays * DAY_MS);
  return { expiresAt, purgeAt: new Date(expiresAt.getTime() + PURGE_AFTER_MS) };
}

export async function createSession({ userId, deviceId, client }) {
  // One live session per device: signing in again replaces the previous one.
  await Session.updateMany(
    { userId, deviceId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'replaced' } },
  );

  const refreshToken = generateToken();
  const session = await Session.create({
    userId,
    deviceId,
    tokenHash: hashToken(refreshToken),
    ip: client?.ip ?? null,
    userAgent: client?.userAgent ?? null,
    ...lifetimes(),
  });
  return { session, refreshToken };
}

/**
 * Exchanges a refresh token for a new one (rotation).
 * Presenting a token that was already rotated closes the session: either the legitimate
 * client or an attacker holds a stale copy, and the server cannot tell which.
 */
export async function rotateSession(refreshToken, client) {
  const presentedHash = hashToken(refreshToken);
  const now = new Date();
  const nextToken = generateToken();

  const session = await Session.findOneAndUpdate(
    { tokenHash: presentedHash, revokedAt: null, expiresAt: { $gt: now } },
    {
      $set: {
        tokenHash: hashToken(nextToken),
        previousTokenHash: presentedHash,
        rotatedAt: now,
        lastUsedAt: now,
        ip: client?.ip ?? null,
        userAgent: client?.userAgent ?? null,
        ...lifetimes(now.getTime()),
      },
    },
    { returnDocument: 'after' },
  );
  if (session) {
    return { session, refreshToken: nextToken };
  }

  const reused = await Session.findOne({ previousTokenHash: presentedHash, revokedAt: null });
  if (reused) {
    const withinGrace = reused.rotatedAt && now - reused.rotatedAt < REUSE_GRACE_MS;
    if (!withinGrace) {
      await revokeSessionDocument(reused, 'refresh_token_reuse');
      await recordAudit(AUDIT_ACTIONS.TOKEN_REUSE, {
        userId: reused.userId,
        sessionId: String(reused._id),
        deviceId: reused.deviceId,
        client,
      });
      throw unauthenticated(ERROR_CODES.REFRESH_TOKEN_REUSED);
    }
  }
  throw unauthenticated(ERROR_CODES.INVALID_REFRESH_TOKEN);
}

async function revokeSessionDocument(session, reason) {
  await Session.updateOne(
    { _id: session._id, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: reason,
        purgeAt: new Date(Date.now() + PURGE_AFTER_MS),
      },
    },
  );
}

/** Loads a session that is still usable, or null. */
export function findActiveSession(sessionId) {
  return Session.findOne({
    _id: sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
}

export async function revokeSession(userId, sessionId, reason = 'logout') {
  const session = await Session.findOne({ _id: sessionId, userId, revokedAt: null });
  if (!session) throw notFound();
  await revokeSessionDocument(session, reason);
  return session;
}

export async function revokeAllSessions(userId, { exceptSessionId, reason = 'logout_all' } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const now = new Date();
  const result = await Session.updateMany(filter, {
    $set: {
      revokedAt: now,
      revokedReason: reason,
      purgeAt: new Date(now.getTime() + PURGE_AFTER_MS),
    },
  });
  return result.modifiedCount;
}

export async function revokeDeviceSessions(userId, deviceId, reason = 'device_removed') {
  const now = new Date();
  await Session.updateMany(
    { userId, deviceId, revokedAt: null },
    {
      $set: {
        revokedAt: now,
        revokedReason: reason,
        purgeAt: new Date(now.getTime() + PURGE_AFTER_MS),
      },
    },
  );
}

export async function listSessions(userId, currentSessionId) {
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ lastUsedAt: -1 });
  const devices = await Device.find({
    _id: { $in: sessions.map((session) => session.deviceId) },
    userId,
  });
  const deviceById = new Map(devices.map((device) => [String(device._id), device]));
  return sessions.map((session) =>
    serializeSession(session, { device: deviceById.get(session.deviceId), currentSessionId }),
  );
}
