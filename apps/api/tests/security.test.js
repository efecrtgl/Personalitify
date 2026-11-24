import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashToken,
  passwordNeedsRehash,
  verifyPassword,
} from '../src/core/crypto.js';
import { findForbiddenKey } from '../src/core/validation.js';
import { configureRateLimits } from '../src/middleware/rate-limit.js';
import { API, anonymous, deviceInput, getApp, registerUser } from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

describe('security', () => {
  useTestDatabase();
  afterEach(() =>
    configureRateLimits({ enabled: false, authMax: 10, refreshMax: 60, generalMax: 300 }),
  );

  it('sends hardened response headers and hides the framework', async () => {
    const response = await anonymous().get('/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('echoes a well-formed request id and replaces a malformed one', async () => {
    const good = await anonymous().get('/health').set('X-Request-Id', 'client-trace-0001');
    expect(good.headers['x-request-id']).toBe('client-trace-0001');
    const bad = await anonymous().get('/health').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  describe('CORS', () => {
    it('allows configured origins with credentials', async () => {
      const response = await request(getApp())
        .options(`${API}/auth/login`)
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not grant access to other origins', async () => {
      const response = await request(getApp())
        .get(`${API}/health`)
        .set('Origin', 'https://evil.example');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('input hardening', () => {
    it('rejects MongoDB operators in credentials (NoSQL injection)', async () => {
      await registerUser();
      const response = await anonymous()
        .post('/auth/login', {
          email: { $ne: null },
          password: { $ne: null },
          device: deviceInput(),
        })
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.details[0].code).toBe('forbidden_key');
    });

    it('rejects operator and dotted keys anywhere in a body or query', async () => {
      const user = await registerUser();
      await user.patch('/settings', { notifications: { $set: { inApp: false } } }).expect(400);
      await user.patch('/settings', { 'privacy.hideSensitivePreviews': true }).expect(400);
      await user.get('/account/security-log?page[$gt]=1').expect(400);
      expect(findForbiddenKey({ a: [{ b: { $where: '1' } }] })).toBe('$where');
      expect(findForbiddenKey({ a: [{ b: 'plain $text with . dots' }] })).toBeNull();
    });

    it('answers malformed JSON, oversized bodies and non-JSON bodies with clear errors', async () => {
      const malformed = await request(getApp())
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(malformed.body.error.code).toBe('MALFORMED_JSON');

      const large = await request(getApp())
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'x'.repeat(1_200_000) }))
        .expect(413);
      expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');

      await request(getApp())
        .post(`${API}/auth/login`)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('email=a%40b.c&password=x')
        .expect(415);
    });

    it('does not leak internals in error responses', async () => {
      const response = await anonymous()
        .post('/auth/login', { email: 'a@b.co', password: 'x', device: deviceInput() })
        .expect(401);
      expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message', 'requestId']);
      expect(JSON.stringify(response.body)).not.toMatch(/stack|mongo|node_modules/i);
    });
  });

  describe('rate limiting', () => {
    it('limits credential endpoints per client and says when to retry', async () => {
      configureRateLimits({ enabled: true, authMax: 3 });
      const attempt = () =>
        anonymous().post('/auth/login', {
          email: 'nobody@example.test',
          password: 'guess',
          device: deviceInput(),
        });
      for (let index = 0; index < 3; index += 1) {
        await attempt().expect(401);
      }
      const limited = await attempt().expect(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

      // Other endpoints are unaffected by the credential limit.
      await anonymous().get('/health').expect(200);
    });

    it('does not count session restores against the credential limit', async () => {
      // A browser restores its session on every page load; reloading a few times must not
      // lock the user out of signing in.
      configureRateLimits({ enabled: true, authMax: 2, refreshMax: 5 });
      for (let index = 0; index < 5; index += 1) {
        await anonymous().post('/auth/refresh', {}).expect(401);
      }
      await anonymous().post('/auth/refresh', {}).expect(429);
      await anonymous()
        .post('/auth/login', { email: 'nobody@example.test', password: 'x', device: deviceInput() })
        .expect(401);
    });
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('tr0ub4dor & 3');
    expect(hash.split('$')).toHaveLength(6);
    expect(await verifyPassword('tr0ub4dor & 3', hash)).toBe(true);
    expect(await verifyPassword('tr0ub4dor & 4', hash)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('salts every hash and treats equivalent Unicode forms alike', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
    // "é" as one code point and as "e" + combining accent.
    const composed = await hashPassword('café-parola');
    expect(await verifyPassword('café-parola', composed)).toBe(true);
  });

  it('detects hashes made with weaker parameters', async () => {
    expect(passwordNeedsRehash(await hashPassword('x'))).toBe(false);
    expect(passwordNeedsRehash('scrypt$16$8$1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('fingerprints tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
