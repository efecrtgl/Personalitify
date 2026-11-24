import { randomUUID } from 'node:crypto';
import { notFound } from '../../core/errors.js';
import { registerUserCollection } from '../../core/user-data.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { revokeDeviceSessions } from '../auth/session.service.js';
import { Device, serializeDevice } from './device.model.js';

registerUserCollection({ key: 'devices', model: Device, serialize: serializeDevice });

/**
 * Registers the installation a user is signing in from, or refreshes its details when it is
 * already known. Idempotent per (user, installationId).
 */
export async function registerDevice(userId, input) {
  return Device.findOneAndUpdate(
    { userId, installationId: input.installationId },
    {
      $set: {
        name: input.name,
        clientType: input.clientType,
        platform: input.platform,
        appId: input.appId,
        appVersion: input.appVersion ?? null,
        osVersion: input.osVersion ?? null,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { _id: randomUUID() },
    },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
}

export async function listDevices(userId, currentDeviceId) {
  const devices = await Device.find({ userId }).sort({ lastSeenAt: -1 });
  return devices.map((device) => serializeDevice(device, { currentDeviceId }));
}

export async function getDevice(userId, deviceId) {
  const device = await Device.findOne({ _id: deviceId, userId });
  if (!device) throw notFound();
  return device;
}

export async function updateDevice(userId, deviceId, patch, currentDeviceId) {
  const device = await getDevice(userId, deviceId);
  if (patch.name !== undefined) device.name = patch.name;
  if (patch.appVersion !== undefined) device.appVersion = patch.appVersion;
  if (patch.osVersion !== undefined) device.osVersion = patch.osVersion;
  await device.save();
  return serializeDevice(device, { currentDeviceId });
}

/** Removes a device and signs it out everywhere. */
export async function removeDevice(auth, deviceId, client) {
  const device = await getDevice(auth.userId, deviceId);
  await revokeDeviceSessions(auth.userId, deviceId);
  await device.deleteOne();
  await recordAudit(AUDIT_ACTIONS.DEVICE_REMOVED, {
    userId: auth.userId,
    sessionId: auth.sessionId,
    deviceId,
    client,
    metadata: { name: device.name },
  });
}

const lastTouch = new Map();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** Records device activity at most once per interval, without blocking the request. */
export function touchDevice(deviceId) {
  const now = Date.now();
  if (now - (lastTouch.get(deviceId) ?? 0) < TOUCH_INTERVAL_MS) return;
  lastTouch.set(deviceId, now);
  if (lastTouch.size > 10_000) lastTouch.clear();
  Device.updateOne({ _id: deviceId }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {
    lastTouch.delete(deviceId);
  });
}
