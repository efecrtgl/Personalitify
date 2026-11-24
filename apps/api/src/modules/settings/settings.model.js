import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@personalitify/localization';
import {
  DASHBOARD_WIDGETS,
  DATE_FORMATS,
  DEFAULT_TIME_ZONE,
  THEMES,
  TIME_FORMATS,
  WEEK_STARTS,
} from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

const timeOfDay = { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ };

/**
 * Preferences that follow the user to every client. One document per user; `_id` equals the
 * user id.
 */
const settingsSchema = new mongoose.Schema(
  {
    language: { type: String, enum: SUPPORTED_LANGUAGES, default: DEFAULT_LANGUAGE },
    theme: { type: String, enum: THEMES, default: 'system' },
    timeZone: { type: String, default: DEFAULT_TIME_ZONE, maxlength: 64 },
    dateFormat: { type: String, enum: DATE_FORMATS, default: 'dmy' },
    timeFormat: { type: String, enum: TIME_FORMATS, default: '24h' },
    weekStart: { type: Number, enum: WEEK_STARTS, default: 1 },
    notifications: {
      inApp: { type: Boolean, default: true },
      habitReminders: { type: Boolean, default: true },
      taskReminders: { type: Boolean, default: true },
      goalReminders: { type: Boolean, default: true },
      eventReminders: { type: Boolean, default: true },
      achievements: { type: Boolean, default: true },
      quietHours: {
        enabled: { type: Boolean, default: false },
        start: { ...timeOfDay, default: '22:00' },
        end: { ...timeOfDay, default: '07:00' },
      },
    },
    privacy: {
      // Hide journal and mood text in previews, summaries and notifications.
      hideSensitivePreviews: { type: Boolean, default: false },
    },
    dashboard: {
      // The user's order and visibility of dashboard widgets. Bounded by the known widgets.
      widgets: {
        type: [
          new mongoose.Schema(
            {
              id: { type: String, enum: DASHBOARD_WIDGETS, required: true },
              visible: { type: Boolean, default: true },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
  },
  { collection: 'userSettings' },
);

settingsSchema.plugin(syncedEntity);
settingsSchema.index({ userId: 1 }, { unique: true });

export const Settings = mongoose.model('Settings', settingsSchema);

/**
 * The stored layout completed with every known widget: widgets the user has not arranged
 * yet (a new account, or a widget added to the product later) follow in the default order.
 */
export function dashboardLayout(stored = []) {
  const known = stored.filter((widget) => DASHBOARD_WIDGETS.includes(widget.id));
  const listed = new Set(known.map((widget) => widget.id));
  return [
    ...known.map((widget) => ({ id: widget.id, visible: widget.visible })),
    ...DASHBOARD_WIDGETS.filter((id) => !listed.has(id)).map((id) => ({ id, visible: true })),
  ];
}

export function serializeSettings(settings) {
  const { notifications, privacy } = settings;
  return {
    ...baseResource(settings),
    language: settings.language,
    theme: settings.theme,
    timeZone: settings.timeZone,
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    weekStart: settings.weekStart,
    notifications: {
      inApp: notifications.inApp,
      habitReminders: notifications.habitReminders,
      taskReminders: notifications.taskReminders,
      goalReminders: notifications.goalReminders,
      eventReminders: notifications.eventReminders,
      achievements: notifications.achievements,
      quietHours: {
        enabled: notifications.quietHours.enabled,
        start: notifications.quietHours.start,
        end: notifications.quietHours.end,
      },
    },
    privacy: {
      hideSensitivePreviews: privacy.hideSensitivePreviews,
    },
    dashboard: { widgets: dashboardLayout(settings.dashboard?.widgets) },
  };
}
