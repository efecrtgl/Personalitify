import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@personalitify/localization';
import { CLIENT_TYPES, DEFAULT_TIME_ZONE, PLATFORMS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { idSchema, timeZoneSchema } from '../../core/validation.js';
import { settingsSchema } from '../settings/settings.schemas.js';
import { profileSchema, userSchema } from '../users/users.schemas.js';

export const emailSchema = z.email().max(254).describe('Email address');

export const passwordSchema = z.string().min(8).max(128).describe('Password, 8 to 128 characters');

export const deviceInputSchema = z
  .strictObject({
    installationId: idSchema.describe(
      'UUID generated once by the client installation and reused for every sign-in from it',
    ),
    name: z.string().trim().min(1).max(80).describe('Human-readable device name'),
    clientType: z.enum(CLIENT_TYPES),
    platform: z.enum(PLATFORMS),
    appId: z.string().min(1).max(64).describe('Application identifier, e.g. personalitify-desktop'),
    appVersion: z.string().max(32).optional(),
    osVersion: z.string().max(64).optional(),
  })
  .describe('The client installation that is signing in');

export const registerBody = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(60),
  language: z.enum(SUPPORTED_LANGUAGES).default(DEFAULT_LANGUAGE),
  timeZone: timeZoneSchema.default(DEFAULT_TIME_ZONE),
  device: deviceInputSchema,
});

export const loginBody = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
  device: deviceInputSchema,
});

export const refreshBody = z.strictObject({
  refreshToken: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe('Required for native clients. Browser clients send the HttpOnly cookie instead.'),
});

export const tokenBody = z.strictObject({ token: z.string().min(1).max(512) });

export const forgotPasswordBody = z.strictObject({ email: emailSchema });

export const resetPasswordBody = z.strictObject({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const tokensSchema = z
  .strictObject({
    accessToken: z.string().describe('JWT sent as `Authorization: Bearer <token>`'),
    tokenType: z.literal('Bearer'),
    expiresIn: z.int().describe('Lifetime of the access token in seconds'),
    accessTokenExpiresAt: z.string(),
    refreshToken: z
      .string()
      .nullable()
      .describe('Null for browser clients, which receive it as an HttpOnly cookie'),
    refreshTokenExpiresAt: z.string(),
    sessionId: z.string(),
    deviceId: z.string().describe('Server-side device id of this installation'),
  })
  .describe('Token set');

export const authResultSchema = z.strictObject({
  tokens: tokensSchema,
  user: userSchema,
  profile: profileSchema,
  settings: settingsSchema,
});

export const sessionSchema = z.strictObject({
  id: z.string(),
  deviceId: z.string(),
  device: z
    .strictObject({
      id: z.string(),
      name: z.string(),
      clientType: z.enum(CLIENT_TYPES),
      platform: z.enum(PLATFORMS),
    })
    .nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});

export const revokedCountSchema = z.strictObject({ revokedSessions: z.int() });
