import { randomUUID } from 'node:crypto';
import {
  compareVersions,
  inRollout,
  isValidVersion,
  rolloutBucket,
} from '@personalitify/shared-contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { setRole } from '../scripts/admin-role.js';
import { AppRelease, RemoteConfigEntry } from '../src/modules/platform/platform.model.js';
import { anonymous, deviceInput, loginUser, registerUser, uniqueEmail } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

describe('versions and rollouts', () => {
  it('compares versions by number, not by text', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
    expect(['1.0.0', '0.0.1', '10.20.30'].every(isValidVersion)).toBe(true);
    expect(['1.0', 'v1.0.0', '1.0.0-beta', '', null].some(isValidVersion)).toBe(false);
    expect(() => compareVersions('1.0', '1.0.0')).toThrow(TypeError);
  });

  it('places an installation in the same bucket every time, spread evenly', () => {
    const ids = Array.from({ length: 2000 }, () => randomUUID());
    expect(rolloutBucket(ids[0], 'release-a')).toBe(rolloutBucket(ids[0], 'release-a'));
    const included = ids.filter((id) => inRollout(id, 'release-a', 30)).length;
    expect(included / ids.length).toBeGreaterThan(0.25);
    expect(included / ids.length).toBeLessThan(0.35);
    // Being early for one rollout says nothing about another.
    const both = ids.filter(
      (id) => inRollout(id, 'release-a', 30) && inRollout(id, 'release-b', 30),
    ).length;
    expect(both / ids.length).toBeLessThan(0.15);
    expect(inRollout(ids[0], 'x', 100)).toBe(true);
    expect(inRollout(ids[0], 'x', 0)).toBe(false);
    expect(inRollout(undefined, 'x', 99)).toBe(false);
    expect(inRollout(undefined, 'x', 100)).toBe(true);
  });
});

describe('updates and remote configuration', () => {
  useTestDatabase();
  // These collections belong to the installation, not to a user: start each test clean.
  beforeEach(async () => {
    await AppRelease.deleteMany({});
    await RemoteConfigEntry.deleteMany({});
  });

  /** A signed-in administrator. */
  async function administrator() {
    const user = await registerUser();
    expect(await setRole(user.credentials.email, 'admin')).toBe(true);
    // Granting the role signs the account out; the next sign-in carries it.
    return loginUser(user.credentials, user.device);
  }
  const release = async (admin, body) =>
    (await admin.post('/admin/releases', { appId: 'personalitify-desktop', ...body }).expect(201))
      .body.data;
  const check = async (query) => {
    const search = new URLSearchParams({
      appId: 'personalitify-desktop',
      platform: 'windows',
      version: '1.0.0',
      ...query,
    });
    return (await anonymous().get(`/updates/check?${search}`).expect(200)).body.data;
  };

  it('answers without sign-in that there is nothing newer when nothing is published', async () => {
    const admin = await administrator();
    expect(await check({})).toMatchObject({
      appId: 'personalitify-desktop',
      platform: 'windows',
      channel: 'stable',
      currentVersion: '1.0.0',
      supported: true,
      minSupportedVersion: null,
      updateAvailable: false,
      mandatory: false,
      latest: null,
    });

    // A draft is offered to nobody.
    const draft = await release(admin, { version: '1.1.0' });
    expect(draft).toMatchObject({ published: false, publishedAt: null, platform: 'any' });
    expect((await check({})).updateAvailable).toBe(false);

    await anonymous()
      .get('/updates/check?appId=personalitify-desktop&platform=windows')
      .expect(400);
    await anonymous()
      .get('/updates/check?appId=personalitify-desktop&platform=windows&version=1.0')
      .expect(400);
    await anonymous().get('/updates/check?appId=other&platform=windows&version=1.0.0').expect(400);
  });

  it('offers the newest published release for the client’s platform and channel', async () => {
    const admin = await administrator();
    await release(admin, {
      version: '1.1.0',
      published: true,
      notes: { tr: 'Hata düzeltmeleri', en: 'Bug fixes' },
    });
    await release(admin, {
      version: '1.2.0',
      platform: 'windows',
      published: true,
      downloadUrl: 'https://downloads.example.test/personalitify-1.2.0.exe',
      sha256: 'a'.repeat(64),
      sizeBytes: 52_000_000,
      notes: { en: 'Faster start' },
    });
    await release(admin, { version: '1.3.0', platform: 'macos', published: true });
    await release(admin, { version: '2.0.0', channel: 'beta', published: true });

    const windows = await check({});
    expect(windows).toMatchObject({ updateAvailable: true, mandatory: false, supported: true });
    expect(windows.latest).toMatchObject({
      version: '1.2.0',
      channel: 'stable',
      notes: { tr: '', en: 'Faster start' },
      downloadUrl: 'https://downloads.example.test/personalitify-1.2.0.exe',
      sha256: 'a'.repeat(64),
      sizeBytes: 52_000_000,
    });
    // Each platform sees its own releases and the ones made for every platform.
    expect((await check({ platform: 'macos' })).latest.version).toBe('1.3.0');
    expect((await check({ platform: 'linux' })).latest.version).toBe('1.1.0');
    // The beta channel also receives stable releases; stable never receives beta ones.
    expect((await check({ channel: 'beta' })).latest).toMatchObject({
      version: '2.0.0',
      channel: 'beta',
    });
    // A client that is up to date, or ahead, is offered nothing.
    expect((await check({ version: '1.2.0' })).updateAvailable).toBe(false);
    expect((await check({ version: '3.0.0' })).latest).toBeNull();
    // Another application has its own releases.
    expect((await check({ appId: 'personalitify-mobile', platform: 'android' })).latest).toBeNull();
  });

  it('marks an update as mandatory and old versions as unsupported', async () => {
    const admin = await administrator();
    await release(admin, { version: '1.1.0', published: true, mandatory: true });
    const newest = await release(admin, { version: '1.2.0', published: true });

    // Skipping a mandatory release makes the update mandatory, whichever is offered.
    expect(await check({ version: '1.0.0' })).toMatchObject({
      mandatory: true,
      supported: true,
      latest: { version: '1.2.0' },
    });
    expect(await check({ version: '1.1.0' })).toMatchObject({
      mandatory: false,
      updateAvailable: true,
    });

    // From now on nothing older than 1.1.0 may run.
    await admin.patch(`/admin/releases/${newest.id}`, { minSupportedVersion: '1.1.0' }).expect(200);
    expect(await check({ version: '1.0.5' })).toMatchObject({
      supported: false,
      mandatory: true,
      minSupportedVersion: '1.1.0',
    });
    expect(await check({ version: '1.1.0' })).toMatchObject({ supported: true });

    // Withdrawing a release takes it out of the answers at once.
    await admin.patch(`/admin/releases/${newest.id}`, { published: false }).expect(200);
    expect(await check({ version: '1.1.0' })).toMatchObject({
      updateAvailable: false,
      minSupportedVersion: null,
    });
  });

  it('rolls a release out to a stable share of installations', async () => {
    const admin = await administrator();
    const gradual = await release(admin, { version: '1.1.0', published: true, rolloutPercent: 40 });
    const installations = Array.from({ length: 60 }, () => randomUUID());

    const offered = [];
    for (const installationId of installations) {
      if ((await check({ installationId })).updateAvailable) offered.push(installationId);
    }
    expect(offered.length).toBeGreaterThan(10);
    expect(offered.length).toBeLessThan(40);
    // The same installation gets the same answer every time.
    expect((await check({ installationId: offered[0] })).updateAvailable).toBe(true);
    // Without an installation id only releases for everyone are offered.
    expect((await check({})).updateAvailable).toBe(false);

    await admin.patch(`/admin/releases/${gradual.id}`, { rolloutPercent: 100 }).expect(200);
    expect((await check({})).updateAvailable).toBe(true);
    await admin.patch(`/admin/releases/${gradual.id}`, { rolloutPercent: 0 }).expect(200);
    expect((await check({ installationId: offered[0] })).updateAvailable).toBe(false);
  });

  it('validates releases', async () => {
    const admin = await administrator();
    const created = await release(admin, { version: '1.1.0' });
    await admin
      .post('/admin/releases', { appId: 'personalitify-desktop', version: '1.1.0' })
      .expect(409);
    const invalid = (body) =>
      admin
        .post('/admin/releases', { appId: 'personalitify-desktop', version: '9.9.9', ...body })
        .expect(400);
    // A client is never sent to fetch an application over plain http.
    await invalid({ downloadUrl: 'http://downloads.example.test/app.exe' });
    await invalid({ sha256: 'abc' });
    await invalid({ rolloutPercent: 101 });
    await invalid({ version: '1.2' });
    await invalid({ minSupportedVersion: '10.0.0' });
    await invalid({ appId: 'something-else' });
    await admin.patch(`/admin/releases/${created.id}`, { version: '1.1.1' }).expect(400);

    expect((await admin.get('/admin/releases').expect(200)).body.data).toHaveLength(1);
    await admin.delete(`/admin/releases/${created.id}`).expect(204);
    await admin.delete(`/admin/releases/${created.id}`).expect(404);
    await admin.patch(`/admin/releases/${created.id}`, { mandatory: true }).expect(404);
  });

  it('serves remote configuration with defaults, targeting and rollout', async () => {
    const admin = await administrator();
    const config = async (query = {}) => {
      const search = new URLSearchParams({ appId: 'personalitify-web', ...query });
      return (await anonymous().get(`/config?${search}`).expect(200)).body.data.values;
    };
    expect(await config()).toEqual({ announcement: null, registrationOpen: true });

    const announcement = {
      id: 'maintenance-2026-12',
      tone: 'warning',
      message: { tr: 'Pazar gecesi bakım yapılacak.', en: 'Maintenance on Sunday night.' },
    };
    const stored = (
      await admin
        .put('/admin/config/announcement', { value: announcement, description: 'December' })
        .expect(200)
    ).body.data;
    expect(stored).toMatchObject({
      key: 'announcement',
      overridden: true,
      enabled: true,
      value: announcement,
      defaultValue: null,
      rolloutPercent: 100,
    });
    expect((await config()).announcement).toEqual(announcement);

    // Only for the desktop application.
    await admin
      .put('/admin/config/announcement', { value: announcement, appIds: ['personalitify-desktop'] })
      .expect(200);
    expect((await config()).announcement).toBeNull();
    expect((await config({ appId: 'personalitify-desktop' })).announcement).toEqual(announcement);

    // Switched off: the default applies, the stored value is kept.
    await admin
      .put('/admin/config/announcement', { value: announcement, enabled: false })
      .expect(200);
    expect((await config({ appId: 'personalitify-desktop' })).announcement).toBeNull();

    // For a share of installations.
    await admin
      .put('/admin/config/announcement', { value: announcement, rolloutPercent: 50 })
      .expect(200);
    const seen = [];
    for (let index = 0; index < 40; index += 1) {
      seen.push((await config({ installationId: randomUUID() })).announcement !== null);
    }
    expect(seen.filter(Boolean).length).toBeGreaterThan(8);
    expect(seen.filter(Boolean).length).toBeLessThan(32);
    expect((await config()).announcement).toBeNull();

    // Values must have the shape of their key.
    await admin.put('/admin/config/announcement', { value: { message: 'hello' } }).expect(400);
    await admin.put('/admin/config/announcement', { value: 'hello' }).expect(400);
    await admin.put('/admin/config/registrationOpen', { value: 'no' }).expect(400);
    await admin.put('/admin/config/unknownKey', { value: true }).expect(400);

    const reset = (await admin.delete('/admin/config/announcement').expect(200)).body.data;
    expect(reset).toMatchObject({ overridden: false, value: null, enabled: false });
    const listed = (await admin.get('/admin/config').expect(200)).body.data;
    expect(listed.map((entry) => entry.key)).toEqual(['announcement', 'registrationOpen']);
  });

  it('closes and reopens registration on the server', async () => {
    const admin = await administrator();
    const existing = await registerUser();
    const attempt = () =>
      anonymous().post('/auth/register', {
        email: uniqueEmail(),
        password: 'correct horse battery',
        displayName: 'Newcomer',
        device: deviceInput(),
      });

    await admin.put('/admin/config/registrationOpen', { value: false }).expect(200);
    const refused = (await attempt().expect(403)).body.error;
    expect(refused).toMatchObject({
      code: 'REGISTRATION_CLOSED',
      message: 'Creating new accounts is closed at the moment.',
    });
    // People who have an account are not affected.
    await loginUser(existing.credentials);

    await admin.put('/admin/config/registrationOpen', { value: true }).expect(200);
    await attempt().expect(201);
    await admin.put('/admin/config/registrationOpen', { value: false, enabled: false }).expect(200);
    await attempt().expect(201);
  });

  it('keeps administration to administrators, and logs what they change', async () => {
    const user = await registerUser();
    const requests = [
      ['get', '/admin/releases'],
      ['post', '/admin/releases', { appId: 'personalitify-web', version: '1.0.0' }],
      ['get', '/admin/config'],
      ['put', '/admin/config/registrationOpen', { value: false }],
      ['delete', '/admin/config/registrationOpen'],
    ];
    for (const [method, path, body] of requests) {
      const forbidden = (await user[method](path, body).expect(403)).body.error;
      expect(forbidden.code).toBe('FORBIDDEN');
    }
    await anonymous().get('/admin/releases').expect(401);
    expect(await RemoteConfigEntry.countDocuments()).toBe(0);

    // The role comes from the command line. Granting it ends the account's sessions, so the
    // old token — which says "user" — stops working at once.
    expect(await setRole('nobody@example.test', 'admin')).toBe(false);
    expect(await setRole(user.credentials.email.toUpperCase(), 'admin')).toBe(true);
    await user.get('/admin/releases').expect(401);
    const admin = await loginUser(user.credentials, user.device);
    expect((await admin.get('/users/me').expect(200)).body.data.user.role).toBe('admin');
    await admin.put('/admin/config/registrationOpen', { value: true }).expect(200);
    await admin
      .post('/admin/releases', { appId: 'personalitify-web', version: '1.0.0' })
      .expect(201);

    const log = (await admin.get('/account/security-log?limit=20').expect(200)).body.data;
    const changes = log.filter((entry) => entry.action === 'admin.change');
    expect(changes.map((entry) => entry.metadata.change).sort()).toEqual([
      'config.set',
      'release.created',
    ]);

    // Revoking works the same way.
    expect(await setRole(user.credentials.email, 'user')).toBe(true);
    await admin.get('/admin/releases').expect(401);
    const demoted = await loginUser(user.credentials, user.device);
    await demoted.get('/admin/releases').expect(403);
  });
});
