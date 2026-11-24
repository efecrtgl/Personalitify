import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

export const AUDIT_ACTIONS = Object.freeze({
  REGISTERED: 'account.registered',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  TOKEN_REUSE: 'auth.refresh_token_reuse',
  SESSION_REVOKED: 'auth.session_revoked',
  DEVICE_REMOVED: 'device.removed',
  EMAIL_VERIFIED: 'account.email_verified',
  PASSWORD_CHANGED: 'account.password_changed',
  PASSWORD_RESET_REQUESTED: 'account.password_reset_requested',
  PASSWORD_RESET: 'account.password_reset',
  DATA_EXPORTED: 'account.data_exported',
  ACCOUNT_DELETED: 'account.deleted',
  ADMIN_CHANGE: 'admin.change',
});

const RETENTION_SECONDS = 180 * 24 * 60 * 60;

/** Security-relevant actions on an account. Entries expire after 180 days. */
const auditLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true },
    action: { type: String, enum: Object.values(AUDIT_ACTIONS), required: true },
    sessionId: { type: String, default: null },
    deviceId: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 400 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'auditLogs',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    minimize: false,
  },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export function serializeAuditLog(entry) {
  return {
    id: String(entry._id),
    action: entry.action,
    sessionId: entry.sessionId,
    deviceId: entry.deviceId,
    ip: entry.ip,
    userAgent: entry.userAgent,
    metadata: entry.metadata ?? {},
    createdAt: entry.createdAt.toISOString(),
  };
}
