import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { routeRegistry } from '../src/core/routing.js';
import { API, anonymous, deviceInput, getApp, loginUser, registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);

function forge(claims, { key = secret, expiresIn = '10m' } = {}) {
  return new SignJWT({ sid: randomUUID(), did: randomUUID(), role: 'user', ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub ?? randomUUID())
    .setIssuer('personalitify')
    .setAudience('personalitify-api')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

describe('authorization', () => {
  useTestDatabase();
  getApp();

  it('requires authentication on every protected route of the API', async () => {
    const protectedRoutes = routeRegistry.filter((route) => route.auth !== 'none');
    expect(protectedRoutes.length).toBeGreaterThan(10);

    for (const route of protectedRoutes) {
      const path = route.path.replace(/:(\w+)/g, () => randomUUID());
      const response = await request(getApp())[route.method](`${API}${path}`).send();
      expect(response.status, `${route.method.toUpperCase()} ${route.path}`).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects malformed, foreign-signed and expired access tokens', async () => {
    const call = (token) =>
      request(getApp()).get(`${API}/users/me`).set('Authorization', `Bearer ${token}`);

    await call('not-a-jwt').expect(401);
    await request(getApp()).get(`${API}/users/me`).set('Authorization', 'Basic abc').expect(401);

    const foreign = await forge({}, { key: new TextEncoder().encode('x'.repeat(48)) });
    expect((await call(foreign)).body.error.code).toBe('UNAUTHENTICATED');

    const expired = await forge({}, { expiresIn: '-1m' });
    expect((await call(expired)).body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a correctly signed token whose session does not exist', async () => {
    const user = await registerUser();
    const token = await forge({ sub: user.userId });
    const response = await request(getApp())
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(response.body.error.code).toBe('SESSION_REVOKED');
  });

  it('rejects a token that names another user for an existing session', async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const token = await forge({ sub: bob.userId, sid: alice.tokens.sessionId });
    await request(getApp())
      .get(`${API}/users/me`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  describe('data isolation between users', () => {
    it('never exposes or changes another user’s sessions and devices', async () => {
      const alice = await registerUser({ displayName: 'Alice' });
      const bob = await registerUser({ displayName: 'Bob' });

      const bobSessions = await bob.get('/auth/sessions').expect(200);
      expect(bobSessions.body.data.map((s) => s.id)).toEqual([bob.tokens.sessionId]);
      const bobDevices = await bob.get('/devices').expect(200);
      expect(bobDevices.body.data.map((d) => d.id)).toEqual([bob.tokens.deviceId]);

      await bob.delete(`/auth/sessions/${alice.tokens.sessionId}`).expect(404);
      await bob.delete(`/devices/${alice.tokens.deviceId}`).expect(404);
      await bob.patch(`/devices/${alice.tokens.deviceId}`, { name: 'Hijacked' }).expect(404);

      await alice.get('/users/me').expect(200);
      const aliceDevices = await alice.get('/devices').expect(200);
      expect(aliceDevices.body.data[0].name).toBe('Test desktop');
    });

    it('scopes profile and settings to the caller', async () => {
      const alice = await registerUser({ displayName: 'Alice' });
      const bob = await registerUser({ displayName: 'Bob' });

      await bob.patch('/users/me/profile', { displayName: 'Robert' }).expect(200);
      await bob.patch('/settings', { theme: 'dark' }).expect(200);

      const aliceMe = await alice.get('/users/me').expect(200);
      expect(aliceMe.body.data.profile.displayName).toBe('Alice');
      expect(aliceMe.body.data.settings.theme).toBe('system');
    });
  });

  describe('devices', () => {
    it('renames a device and removes another one together with its session', async () => {
      const desktop = await registerUser();
      const phone = await loginUser(
        desktop.credentials,
        deviceInput({ name: 'Phone', clientType: 'mobile', platform: 'ios' }),
      );

      const renamed = await desktop
        .patch(`/devices/${desktop.tokens.deviceId}`, { name: 'Studio PC' })
        .expect(200);
      expect(renamed.body.data).toMatchObject({ name: 'Studio PC', current: true });

      const current = await phone.get('/devices/current').expect(200);
      expect(current.body.data).toMatchObject({ name: 'Phone', platform: 'ios', syncCursor: 0 });

      await desktop.delete(`/devices/${phone.tokens.deviceId}`).expect(204);
      await phone.get('/users/me').expect(401);
      const remaining = await desktop.get('/devices').expect(200);
      expect(remaining.body.data).toHaveLength(1);
    });
  });

  it('answers unknown routes with a structured, localized 404', async () => {
    const response = await anonymous().get('/nope').expect(404);
    expect(response.body.error).toMatchObject({
      code: 'ROUTE_NOT_FOUND',
      message: 'This address does not exist.',
    });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});
