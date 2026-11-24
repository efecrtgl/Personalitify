import { CLIENT_TYPES, PLATFORMS } from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { idSchema } from '../../core/validation.js';
import { serializeDevice } from './device.model.js';
import { getDevice, listDevices, removeDevice, updateDevice } from './devices.service.js';

export const deviceSchema = z
  .strictObject({
    id: z.string(),
    installationId: z.string(),
    name: z.string(),
    clientType: z.enum(CLIENT_TYPES),
    platform: z.enum(PLATFORMS),
    appId: z.string(),
    appVersion: z.string().nullable(),
    osVersion: z.string().nullable(),
    lastSeenAt: z.string(),
    syncCursor: z.int().describe('Highest event sequence number the device has acknowledged'),
    lastSyncAt: z.string().nullable(),
    createdAt: z.string(),
    current: z.boolean().describe('True for the device making the request'),
  })
  .describe('Device');

const deviceParams = z.strictObject({ deviceId: idSchema });

const devices = createModule({
  tag: 'Devices',
  description:
    'Client installations registered to the account. A device is registered automatically ' +
    'when it signs in; its id is returned as `tokens.deviceId`.',
  basePath: '/devices',
});

devices.get('', { summary: 'List devices', response: z.array(deviceSchema) }, ({ auth }) =>
  listDevices(auth.userId, auth.deviceId),
);

devices.get(
  '/current',
  { summary: 'Get the device making the request', response: deviceSchema },
  async ({ auth }) =>
    serializeDevice(await getDevice(auth.userId, auth.deviceId), {
      currentDeviceId: auth.deviceId,
    }),
);

devices.patch(
  '/:deviceId',
  {
    summary: 'Rename a device or report its new application version',
    params: deviceParams,
    body: z.strictObject({
      name: z.string().trim().min(1).max(80).optional(),
      appVersion: z.string().max(32).optional(),
      osVersion: z.string().max(64).optional(),
    }),
    response: deviceSchema,
    errors: ['NOT_FOUND', 'VALIDATION_FAILED'],
  },
  ({ auth, params, body }) => updateDevice(auth.userId, params.deviceId, body, auth.deviceId),
);

devices.delete(
  '/:deviceId',
  {
    summary: 'Remove a device and sign it out',
    params: deviceParams,
    status: 204,
    errors: ['NOT_FOUND'],
  },
  ({ auth, params, req }) => removeDevice(auth, params.deviceId, req.client),
);

export const devicesRouter = devices.router;
