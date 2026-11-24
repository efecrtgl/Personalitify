import mongoose from 'mongoose';
import { baseResource } from '../../core/entity/entity-service.js';
import { syncedEntity } from '../../database/plugins/synced-entity.js';

/** Public-facing personal details. One document per user; `_id` equals the user id. */
const profileSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    bio: { type: String, default: '', trim: true, maxlength: 280 },
    avatarColor: { type: String, default: '#0a84ff', match: /^#[0-9a-fA-F]{6}$/ },
  },
  { collection: 'profiles' },
);

profileSchema.plugin(syncedEntity);
profileSchema.index({ userId: 1 }, { unique: true });

export const Profile = mongoose.model('Profile', profileSchema);

export function serializeProfile(profile) {
  return {
    ...baseResource(profile),
    displayName: profile.displayName,
    bio: profile.bio,
    avatarColor: profile.avatarColor,
  };
}
