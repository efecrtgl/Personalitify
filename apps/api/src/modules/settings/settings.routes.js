import { createModule } from '../../core/routing.js';
import { settingsSchema, updateSettingsBody } from './settings.schemas.js';
import { getSettings, updateSettings } from './settings.service.js';

const settings = createModule({
  tag: 'Settings',
  description:
    'Preferences that follow the user to every client: language, theme, time zone, date and ' +
    'time formats, notification and privacy preferences.',
  basePath: '/settings',
});

settings.get('', { summary: 'Get settings', response: settingsSchema }, ({ auth }) =>
  getSettings(auth),
);

settings.patch(
  '',
  {
    summary: 'Update settings',
    description: 'Partial update. Nested objects are merged key by key.',
    body: updateSettingsBody,
    response: settingsSchema,
    errors: ['VALIDATION_FAILED', 'VERSION_CONFLICT'],
  },
  ({ auth, body }) => updateSettings(auth, body),
);

export const settingsRouter = settings.router;
