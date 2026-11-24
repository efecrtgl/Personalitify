import { SUPPORTED_LANGUAGES } from '@personalitify/localization';
import { DATE_FORMATS, THEMES, TIME_FORMATS, WEEK_STARTS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { baseVersionSchema, timeOfDaySchema, timeZoneSchema } from '../../core/validation.js';
import { syncedResourceFields } from '../users/users.schemas.js';

const weekStartSchema = z
  .union(WEEK_STARTS.map((day) => z.literal(day)))
  .describe('ISO weekday the week starts on: 1 Monday, 6 Saturday, 7 Sunday');

const quietHoursSchema = z.strictObject({
  enabled: z.boolean(),
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});

const notificationPreferencesSchema = z.strictObject({
  inApp: z.boolean(),
  habitReminders: z.boolean(),
  taskReminders: z.boolean(),
  goalReminders: z.boolean(),
  eventReminders: z.boolean(),
  achievements: z.boolean(),
  quietHours: quietHoursSchema,
});

const privacySchema = z.strictObject({
  hideSensitivePreviews: z
    .boolean()
    .describe('Hide journal and mood text in previews, summaries and notifications'),
});

export const settingsSchema = z
  .strictObject({
    ...syncedResourceFields,
    language: z.enum(SUPPORTED_LANGUAGES),
    theme: z.enum(THEMES),
    timeZone: z.string(),
    dateFormat: z.enum(DATE_FORMATS),
    timeFormat: z.enum(TIME_FORMATS),
    weekStart: weekStartSchema,
    notifications: notificationPreferencesSchema,
    privacy: privacySchema,
  })
  .describe('User settings');

/** Partial update. Nested objects are merged key by key. */
export const updateSettingsBody = z.strictObject({
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  theme: z.enum(THEMES).optional(),
  timeZone: timeZoneSchema.optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  timeFormat: z.enum(TIME_FORMATS).optional(),
  weekStart: weekStartSchema.optional(),
  notifications: notificationPreferencesSchema
    .partial()
    .extend({ quietHours: quietHoursSchema.partial().optional() })
    .optional(),
  privacy: privacySchema.partial().optional(),
  baseVersion: baseVersionSchema,
});
