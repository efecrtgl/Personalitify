import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * A signed-in device. Holds only the hash of the current refresh token; the token itself is
 * never stored. `previousTokenHash` exists solely to detect reuse of a rotated token.
 */
const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true, immutable: true },
    deviceId: { type: String, required: true, immutable: true },
    tokenHash: { type: String, required: true, select: false },
    previousTokenHash: { type: String, default: null, select: false },
    rotatedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    lastUsedAt: { type: Date, default: Date.now },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 400 },
    // Finished sessions are kept briefly for the security log, then removed by MongoDB.
    purgeAt: { type: Date, required: true },
  },
  { collection: 'sessions', timestamps: true, versionKey: false },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ previousTokenHash: 1 }, { sparse: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ deviceId: 1 });
sessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);

export function serializeSession(session, { device, currentSessionId } = {}) {
  return {
    id: String(session._id),
    deviceId: session.deviceId,
    device: device
      ? {
          id: String(device._id),
          name: device.name,
          clientType: device.clientType,
          platform: device.platform,
        }
      : null,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ip: session.ip,
    userAgent: session.userAgent,
    current: currentSessionId !== undefined && String(session._id) === currentSessionId,
  };
}
