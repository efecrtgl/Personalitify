import { z } from 'zod';
import { baseVersionSchema, hexColorSchema } from '../../core/validation.js';

export const userSchema = z
  .strictObject({
    id: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    role: z.enum(['user', 'admin']),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  })
  .describe('Account identity');

/** Fields present on every synchronized resource. */
export const syncedResourceFields = {
  id: z.string().describe('UUID'),
  version: z.int().describe('Entity version, incremented on every change'),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const profileSchema = z
  .strictObject({
    ...syncedResourceFields,
    displayName: z.string(),
    bio: z.string(),
    avatarColor: z.string(),
  })
  .describe('Profile');

export const updateProfileBody = z.strictObject({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarColor: hexColorSchema.optional(),
  baseVersion: baseVersionSchema,
});
