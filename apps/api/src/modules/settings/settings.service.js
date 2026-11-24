import { ENTITY_TYPES } from '@personalitify/shared-contracts';
import { createEntityService } from '../../core/entity/entity-service.js';
import { Settings, serializeSettings } from './settings.model.js';

export const settingsService = createEntityService({
  entityType: ENTITY_TYPES.SETTINGS,
  model: Settings,
  serialize: serializeSettings,
});

export async function getSettings(auth) {
  return serializeSettings(await settingsService.getById(auth, auth.userId));
}

export async function updateSettings(auth, { baseVersion, ...patch }) {
  const settings = await settingsService.update(auth, auth.userId, patch, { baseVersion });
  return serializeSettings(settings);
}

/**
 * Preferences that backend logic needs for a user (time zone for day boundaries, language
 * for generated text). Read without loading the whole document.
 */
export async function getUserPreferences(userId) {
  const settings = await Settings.findOne({ userId })
    .select('language timeZone weekStart notifications privacy')
    .lean();
  return settings;
}
