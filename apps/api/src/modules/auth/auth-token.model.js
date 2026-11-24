import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

export const AUTH_TOKEN_TYPES = Object.freeze({
  EMAIL_VERIFICATION: 'email-verification',
  PASSWORD_RESET: 'password-reset',
});

/** Single-use tokens sent by email. Only the hash is stored; MongoDB removes expired ones. */
const authTokenSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true },
    type: { type: String, enum: Object.values(AUTH_TOKEN_TYPES), required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  {
    collection: 'authTokens',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

authTokenSchema.index({ tokenHash: 1 }, { unique: true });
authTokenSchema.index({ userId: 1, type: 1 });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthToken = mongoose.model('AuthToken', authTokenSchema);
