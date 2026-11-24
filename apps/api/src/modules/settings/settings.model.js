import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@personalitify/localization';
import {
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
  },
  { collection: 'userSettings' },
);

settingsSchema.plugin(syncedEntity);
settingsSchema.index({ userId: 1 }, { unique: true });

export const Settings = mongoose.model('Settings', settingsSchema);

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
  };
}
