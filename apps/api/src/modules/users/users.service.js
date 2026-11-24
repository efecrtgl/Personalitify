import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { notFound } from '../../core/errors.js';
import { settingsService } from '../settings/settings.service.js';
import { Profile, serializeProfile } from './profile.model.js';
import { User, serializeUser } from './user.model.js';

export const profileService = createEntityService({
  entityType: ENTITY_TYPES.PROFILE,
  model: Profile,
  serialize: serializeProfile,
});

export async function getUserOrThrow(userId) {
  const user = await User.findById(userId);
  if (!user) throw notFound();
  return user;
}

/** Everything a client needs to render the signed-in user. */
export async function getCurrentUser(auth) {
  const [user, profile, settings] = await Promise.all([
    getUserOrThrow(auth.userId),
    profileService.getById(auth, auth.userId),
    settingsService.getById(auth, auth.userId),
  ]);
  return {
    user: serializeUser(user),
    profile: serializeProfile(profile),
    settings: settingsService.serialize(settings),
  };
}

export async function updateProfile(auth, { baseVersion, ...patch }) {
  const profile = await profileService.update(auth, auth.userId, patch, { baseVersion });
  return serializeProfile(profile);
}
