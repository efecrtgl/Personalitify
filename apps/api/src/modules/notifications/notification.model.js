import { NOTIFICATION_KINDS } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

/**
 * Something the user should be told. It holds the kind and the values behind it, not a
 * finished sentence: every client phrases it in the user's language.
 *
 * `dedupeKey` names the occasion (for example one reminder time of one habit on one day)
 * and is unique per user, so a job that runs twice, or two processes that run it at once,
 * still tell the user once.
 */
const notificationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true, immutable: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    // What the notification is about, so a client can open it.
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    dedupeKey: { type: String, required: true, immutable: true },
    // Made during the user's quiet hours: listed, but clients must not alert for it.
    silent: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { collection: 'notifications' },
);

notificationSchema.plugin(syncedEntity);
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, deletedAt: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);

export function serializeNotification(notification) {
  return {
    ...baseResource(notification),
    kind: notification.kind,
    params: notification.params ?? {},
    entityType: notification.entityType ?? null,
    entityId: notification.entityId ?? null,
    silent: notification.silent,
    read: Boolean(notification.readAt),
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
  };
}
