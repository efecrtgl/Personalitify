import { logger } from '../../core/logger.js';
import { registerUserCollection } from '../../core/user-data.js';
import { AuditLog, serializeAuditLog } from './audit-log.model.js';

registerUserCollection({ key: 'securityLog', model: AuditLog, serialize: serializeAuditLog });

/**
 * Records a security-relevant action. Never throws: a failure to write the log must not
 * break the action it describes, but it is reported loudly.
 */
export async function recordAudit(action, { userId, sessionId, deviceId, client, metadata } = {}) {
  try {
    await AuditLog.create({
      userId,
      action,
      sessionId: sessionId ?? null,
      deviceId: deviceId ?? null,
      ip: client?.ip ?? null,
      userAgent: client?.userAgent ?? null,
      metadata: metadata ?? {},
    });
  } catch (error) {
    logger.error({ err: error, action, userId }, 'Failed to write audit log entry');
  }
}

export async function listAuditLog(userId, { page, limit }) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  return { items: items.map(serializeAuditLog), total };
}
