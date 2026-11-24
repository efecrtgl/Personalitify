import { describe, expect, it } from 'vitest';
import { listUserCollections } from '../src/core/user-data.js';
import { Session } from '../src/modules/auth/session.model.js';
import { Device } from '../src/modules/devices/device.model.js';
import { SyncEvent } from '../src/modules/events/sync-event.model.js';
import { Settings } from '../src/modules/settings/settings.model.js';
import { Profile } from '../src/modules/users/profile.model.js';
import { User } from '../src/modules/users/user.model.js';
import { DEFAULT_PASSWORD, anonymous, deviceInput, registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

describe('profile and settings', () => {
  useTestDatabase();

  it('updates the profile and bumps its version', async () => {
    const user = await registerUser({ displayName: 'Ada' });
    const response = await user
      .patch('/users/me/profile', {
        displayName: 'Ada Lovelace',
        bio: 'Notes on the engine.',
        avatarColor: '#ff9f0a',
        baseVersion: 1,
      })
      .expect(200);
    expect(response.body.data).toMatchObject({
      displayName: 'Ada Lovelace',
      bio: 'Notes on the engine.',
      avatarColor: '#ff9f0a',
      version: 2,
    });
    await user.patch('/users/me/profile', { avatarColor: 'red' }).expect(400);
    await user.patch('/users/me/profile', { displayName: '   ' }).expect(400);
  });

  it('merges nested settings and validates values', async () => {
    const user = await registerUser();
    const response = await user
      .patch('/settings', {
        theme: 'dark',
        language: 'tr',
        weekStart: 7,
        notifications: { taskReminders: false, quietHours: { enabled: true } },
        privacy: { hideSensitivePreviews: true },
      })
      .expect(200);
    expect(response.body.data).toMatchObject({
      theme: 'dark',
      language: 'tr',
      weekStart: 7,
      version: 2,
      notifications: {
        inApp: true,
        taskReminders: false,
        habitReminders: true,
        quietHours: { enabled: true, start: '22:00', end: '07:00' },
      },
      privacy: { hideSensitivePreviews: true },
    });

    const invalid = await user
      .patch('/settings', {
        timeZone: 'Nowhere/City',
        weekStart: 3,
        notifications: { quietHours: { start: '25:00' } },
      })
      .expect(400);
    expect(invalid.body.error.details.map((detail) => detail.path).sort()).toEqual([
      'notifications.quietHours.start',
      'timeZone',
      'weekStart',
    ]);

    const fetched = await user.get('/settings').expect(200);
    expect(fetched.body.data.version).toBe(2);
  });

  it('detects conflicting edits from two devices and merges compatible ones', async () => {
    const user = await registerUser();
    await user.patch('/settings', { theme: 'dark', baseVersion: 1 }).expect(200);

    // A second device that still has version 1 changes another field: merged.
    const merged = await user.patch('/settings', { language: 'tr', baseVersion: 1 }).expect(200);
    expect(merged.body.data).toMatchObject({ theme: 'dark', language: 'tr', version: 3 });

    // The same stale device now changes the theme too: conflict, server state is returned.
    const conflict = await user.patch('/settings', { theme: 'light', baseVersion: 1 }).expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflict.body.error.details).toMatchObject({
      entityType: 'settings',
      currentVersion: 3,
      conflictingFields: ['theme'],
    });
    expect(conflict.body.error.details.current.theme).toBe('dark');
  });

  it('records profile and settings changes in the event log', async () => {
    const user = await registerUser();
    await user.patch('/settings', { theme: 'light' }).expect(200);
    const events = await SyncEvent.find({ userId: user.userId }).sort({ seq: 1 }).lean();
    expect(events.map((event) => event.type).sort()).toEqual([
      'profile.created',
      'settings.created',
      'settings.updated',
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(events.at(-1)).toMatchObject({
      changedFields: ['theme'],
      deviceId: user.tokens.deviceId,
    });
  });
});

describe('account', () => {
  useTestDatabase();

  it('exports personal data without credentials or token hashes', async () => {
    const user = await registerUser({ displayName: 'Exporter' });
    await user.patch('/settings', { theme: 'dark' }).expect(200);

    const response = await user.get('/account/export').expect(200);
    const exported = response.body.data;
    expect(exported.formatVersion).toBe(1);
    expect(exported.user.email).toBe(user.credentials.email);
    expect(exported.data.profile).toHaveLength(1);
    expect(exported.data.profile[0].displayName).toBe('Exporter');
    expect(exported.data.settings[0].theme).toBe('dark');
    expect(exported.data.devices).toHaveLength(1);
    expect(exported.data.securityLog.length).toBeGreaterThan(0);

    const text = JSON.stringify(exported);
    expect(text).not.toMatch(/passwordHash|tokenHash|scrypt\$/);
    expect(text).not.toContain(user.tokens.refreshToken);
    expect(exported.data).not.toHaveProperty('sessions');
    expect(exported.data).not.toHaveProperty('authTokens');
  });

  it('lists the security log, newest first, with pagination', async () => {
    const user = await registerUser();
    await user.get('/account/export').expect(200);
    const response = await user.get('/account/security-log?limit=1').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].action).toBe('account.data_exported');
    expect(response.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    await user.get('/account/security-log?limit=1000').expect(400);
  });

  it('deletes the account and everything it owns after confirming the password', async () => {
    const user = await registerUser();
    const bystander = await registerUser();

    const wrong = await user.delete('/account', { password: 'not it' }).expect(400);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    await user.get('/users/me').expect(200);

    await user.delete('/account', { password: DEFAULT_PASSWORD }).expect(204);

    const filter = { userId: user.userId };
    expect(await User.findById(user.userId)).toBeNull();
    expect(await Profile.countDocuments(filter)).toBe(0);
    expect(await Settings.countDocuments(filter)).toBe(0);
    expect(await Device.countDocuments(filter)).toBe(0);
    expect(await Session.countDocuments(filter)).toBe(0);
    expect(await SyncEvent.countDocuments(filter)).toBe(0);

    await user.get('/users/me').expect(401);
    await anonymous()
      .post('/auth/login', { ...user.credentials, device: deviceInput() })
      .expect(401);

    // Other accounts are untouched.
    await bystander.get('/users/me').expect(200);
    expect(await Profile.countDocuments({ userId: bystander.userId })).toBe(1);
  });

  it('knows every collection that holds personal data', () => {
    expect(listUserCollections()).toEqual(
      expect.arrayContaining([
        'profile',
        'settings',
        'devices',
        'sessions',
        'authTokens',
        'securityLog',
        'syncEvents',
        'syncCounters',
      ]),
    );
  });
});
