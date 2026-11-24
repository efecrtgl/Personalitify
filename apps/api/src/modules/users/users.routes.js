import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { settingsSchema } from '../settings/settings.schemas.js';
import { profileSchema, updateProfileBody, userSchema } from './users.schemas.js';
import { getCurrentUser, updateProfile } from './users.service.js';

const users = createModule({
  tag: 'Users',
  description: 'The signed-in account and its profile.',
  basePath: '/users',
});

users.get(
  '/me',
  {
    summary: 'Get the signed-in user with profile and settings',
    response: z.strictObject({
      user: userSchema,
      profile: profileSchema,
      settings: settingsSchema,
    }),
  },
  ({ auth }) => getCurrentUser(auth),
);

users.patch(
  '/me/profile',
  {
    summary: 'Update the profile',
    body: updateProfileBody,
    response: profileSchema,
    errors: ['VALIDATION_FAILED', 'VERSION_CONFLICT'],
  },
  ({ auth, body }) => updateProfile(auth, body),
);

export const usersRouter = users.router;
