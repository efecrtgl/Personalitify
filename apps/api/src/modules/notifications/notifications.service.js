import {
  ENTITY_TYPES,
  NOTIFICATION_PREFERENCES,
  NOTIFICATION_RETENTION_DAYS,
  eventName,
} from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { logger } from '../../core/logger.js';
import { localTimeInZone } from '../../core/time.js';
import { subscribe } from '../events/event-bus.js';
import { getUserPreferences } from '../settings/settings.service.js';
import { Notification, serializeNotification } from './notification.model.js';

export const notificationService = createEntityService({
  entityType: ENTITY_TYPES.NOTIFICATION,
  model: Notification,
  serialize: serializeNotification,
});

/** True when `time` (`HH:mm`) lies in the quiet hours, which may run past midnight. */
export function isQuietTime(quietHours, time) {
  if (!quietHours?.enabled) return false;
  const { start, end } = quietHours;
  if (start === end) return false;
  return start < end ? time >= start && time < end : time >= start || time < end;
}

/**
 * Ways a notification can reach the user besides the list in the app. None is built in:
 * the list itself is the in-app channel. A push or e-mail channel registers here and is
 * called once per new notification that is not silent.
 */
const channels = [];
export function registerNotificationChannel(name, deliver) {
  channels.push({ name, deliver });
  return () => {
    const index = channels.findIndex((channel) => channel.deliver === deliver);
    if (index !== -1) channels.splice(index, 1);
  };
}

/**
 * Tells the user something, once per `dedupeKey`, if their preferences allow it.
 * @returns {Promise<object|null>} The new notification, or null when none was made.
 */
export async function notify(userId, { kind, params = {}, entityType, entityId, dedupeKey }) {
  const preferences = await getUserPreferences(userId);
  const settings = preferences?.notifications ?? {};
  if (settings.inApp === false) return null;
  const preference = NOTIFICATION_PREFERENCES[kind];
  if (preference && settings[preference] === false) return null;

  const now = new Date();
  const silent = isQuietTime(
    settings.quietHours,
    localTimeInZone(now, preferences?.timeZone ?? 'UTC'),
  );
  let created;
  try {
    created = await notificationService.create(
      { userId, deviceId: null },
      {
        kind,
        params,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        dedupeKey,
        silent,
      },
    );
  } catch (error) {
    if (error?.code === 11000) return null; // The user has been told already.
    throw error;
  }

  if (!silent) {
    const notification = serializeNotification(created);
    for (const channel of channels) {
      try {
        await channel.deliver({ userId, notification });
      } catch (error) {
        logger.error({ err: error, channel: channel.name }, 'Notification channel failed');
      }
    }
  }
  return created;
}

export async function listNotifications(auth, { unread, page, limit }) {
  const filter = unread ? { readAt: null } : {};
  const [{ items, total }, unreadCount] = await Promise.all([
    notificationService.find(auth, filter, { sort: { createdAt: -1, _id: -1 }, page, limit }),
    countUnread(auth),
  ]);
  return { items: items.map(serializeNotification), total, unread: unreadCount };
}

export const countUnread = (auth) =>
  Notification.countDocuments({ userId: auth.userId, deletedAt: null, readAt: null });

export async function setRead(auth, id, read) {
  const { document } = await notificationService.mutate(auth, id, (notification) => {
    if (Boolean(notification.readAt) !== read) notification.readAt = read ? new Date() : null;
  });
  return serializeNotification(document);
}

/** Marks everything unread as read. Returns how many notifications that were. */
export async function markAllRead(auth) {
  const unread = await Notification.find({ userId: auth.userId, deletedAt: null, readAt: null })
    .select('_id')
    .lean();
  for (const { _id } of unread) {
    await setRead(auth, _id, true);
  }
  return unread.length;
}

export async function deleteNotification(auth, id) {
  await notificationService.remove(auth, id);
}

/** Removes notifications that are past their retention, for every user. */
export async function purgeOldNotifications(now = new Date()) {
  const before = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000);
  const { deletedCount } = await Notification.deleteMany({ createdAt: { $lt: before } });
  return deletedCount;
}

// An unlocked achievement and a timer that ran its full length are worth telling.
subscribe(
  'notifications.achievement-unlocked',
  (event) =>
    notify(event.userId, {
      kind: 'achievement_unlocked',
      params: { key: event.data.key },
      entityType: ENTITY_TYPES.ACHIEVEMENT,
      entityId: event.entityId,
      dedupeKey: `achievement:${event.data.key}`,
    }),
  { types: [eventName(ENTITY_TYPES.ACHIEVEMENT, 'created')] },
);

subscribe(
  'notifications.focus-completed',
  async (event) => {
    const session = event.data;
    const ranOut =
      session.status === 'completed' && session.elapsedSeconds >= session.plannedMinutes * 60;
    if (!ranOut || !event.changedFields.includes('status')) return;
    await notify(event.userId, {
      kind: 'focus_completed',
      params: { kind: session.kind, minutes: session.plannedMinutes },
      entityType: ENTITY_TYPES.FOCUS_SESSION,
      entityId: event.entityId,
      dedupeKey: `focus:${event.entityId}`,
    });
  },
  { types: [eventName(ENTITY_TYPES.FOCUS_SESSION, 'updated')] },
);
