import { NOTIFICATION_KINDS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule, withMeta } from '../../core/routing.js';
import {
  idSchema,
  paginationMeta,
  paginationMetaSchema,
  paginationQuery,
} from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';
import {
  countUnread,
  deleteNotification,
  listNotifications,
  markAllRead,
  setRead,
} from './notifications.service.js';

export const notificationSchema = z
  .strictObject({
    ...syncedResourceFields,
    kind: z.enum(NOTIFICATION_KINDS),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .describe('The values behind the notification; clients phrase it from `kind` and these'),
    entityType: z.string().nullable().describe('What the notification is about'),
    entityId: z.string().nullable(),
    silent: z
      .boolean()
      .describe('Made during the user’s quiet hours: listed, but clients must not alert for it'),
    read: z.boolean(),
    readAt: z.string().nullable(),
  })
  .describe('Notification');

const params = z.strictObject({ notificationId: idSchema });

const notifications = createModule({
  tag: 'Notifications',
  description:
    'What the server wants to tell the user: reminders for habits, tasks, goals and events, ' +
    'unlocked achievements and timers that ran out. Notifications are made by the server ' +
    'according to the user’s notification settings; clients list them, mark them as read ' +
    'and delete them. Each carries its kind and values, not a finished sentence.',
  basePath: '/notifications',
});

notifications.get(
  '',
  {
    summary: 'List notifications',
    description: 'Newest first. `meta.unread` is the number of unread notifications in total.',
    query: z.strictObject({
      unread: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional()
        .describe('Only unread notifications'),
      ...paginationQuery,
    }),
    response: z.array(notificationSchema),
    responseMeta: paginationMetaSchema.extend({ unread: z.int() }),
  },
  async ({ auth, query }) => {
    const { items, total, unread } = await listNotifications(auth, query);
    return withMeta(items, { ...paginationMeta({ ...query, total }), unread });
  },
);

notifications.get(
  '/unread-count',
  {
    summary: 'Count unread notifications',
    response: z.strictObject({ unread: z.int() }),
  },
  async ({ auth }) => ({ unread: await countUnread(auth) }),
);

notifications.post(
  '/read-all',
  {
    summary: 'Mark every notification as read',
    response: z.strictObject({ updated: z.int() }),
  },
  async ({ auth }) => ({ updated: await markAllRead(auth) }),
);

notifications.post(
  '/:notificationId/read',
  {
    summary: 'Mark a notification as read',
    params,
    response: notificationSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params: { notificationId } }) => setRead(auth, notificationId, true),
);

notifications.post(
  '/:notificationId/unread',
  {
    summary: 'Mark a notification as unread',
    params,
    response: notificationSchema,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params: { notificationId } }) => setRead(auth, notificationId, false),
);

notifications.delete(
  '/:notificationId',
  { summary: 'Delete a notification', params, status: 204, errors: ['NOT_FOUND'] },
  async ({ auth, params: { notificationId } }) => {
    await deleteNotification(auth, notificationId);
  },
);

export const notificationsRouter = notifications.router;
