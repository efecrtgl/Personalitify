import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthToken } from '../src/modules/auth/auth-token.model.js';
import { Session } from '../src/modules/auth/session.model.js';
import { User } from '../src/modules/users/user.model.js';
import { clearSentMessages, sentMessages } from '../src/services/mailer.js';
import {
  API,
  DEFAULT_PASSWORD,
  anonymous,
  deviceInput,
  getApp,
  loginUser,
  registerUser,
  uniqueEmail,
} from './helpers/client.js';
import { useTestDatabase } from './helpers/database.js';

const tokenFromLastEmail = () => new URL(sentMessages().at(-1).actionUrl).searchParams.get('token');

describe('authentication', () => {
  useTestDatabase();
  beforeEach(() => clearSentMessages());

  describe('registration', () => {
    it('creates the account with profile, settings, device and a session', async () => {
      const user = await registerUser({ displayName: 'Ada', timeZone: 'America/New_York' });

      expect(user.user).toMatchObject({ emailVerified: false, role: 'user' });
      expect(user.profile).toMatchObject({ displayName: 'Ada', version: 1, id: user.userId });
      expect(user.settings).toMatchObject({ timeZone: 'America/New_York', language: 'en' });
      expect(user.tokens.tokenType).toBe('Bearer');
      expect(user.tokens.refreshToken).toEqual(expect.any(String));

      const me = await user.get('/users/me').expect(200);
      expect(me.body.data.user.email).toBe(user.credentials.email);
    });

    it('never stores or returns the password or the refresh token in clear text', async () => {
      const user = await registerUser();
      const stored = await User.findById(user.userId).select('+passwordHash').lean();
      expect(stored.passwordHash).toMatch(/^scrypt\$/);
      expect(stored.passwordHash).not.toContain(DEFAULT_PASSWORD);
      expect(JSON.stringify(user.user)).not.toMatch(/password/i);

      const session = await Session.findById(user.tokens.sessionId).select('+tokenHash').lean();
      expect(session.tokenHash).not.toBe(user.tokens.refreshToken);
      expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('gives browser clients the refresh token only as an HttpOnly cookie', async () => {
      const response = await anonymous()
        .post('/auth/register', {
          email: uniqueEmail(),
          password: DEFAULT_PASSWORD,
          displayName: 'Web User',
          device: deviceInput({ clientType: 'web', platform: 'web', appId: 'personalitify-web' }),
        })
        .expect(201);

      expect(response.body.data.tokens.refreshToken).toBeNull();
      const cookie = response.headers['set-cookie'].find((c) => c.startsWith('pfy_refresh='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      // Defaults: Turkish and Istanbul.
      expect(response.body.data.settings).toMatchObject({
        language: 'tr',
        timeZone: 'Europe/Istanbul',
      });
    });

    it('rejects a duplicate email regardless of letter case', async () => {
      const user = await registerUser();
      const response = await anonymous()
        .post('/auth/register', {
          email: user.credentials.email.toUpperCase(),
          password: DEFAULT_PASSWORD,
          displayName: 'Copy',
          device: deviceInput(),
        })
        .expect(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('reports every invalid field with localized messages', async () => {
      const body = {
        email: 'not-an-email',
        password: 'short',
        displayName: '',
        timeZone: 'Mars/Olympus',
        device: deviceInput(),
      };
      const english = await anonymous().post('/auth/register', body).expect(400);
      expect(english.body.error.code).toBe('VALIDATION_FAILED');
      const byPath = Object.fromEntries(english.body.error.details.map((d) => [d.path, d]));
      expect(byPath.email.code).toBe('invalid_email');
      expect(byPath.password).toMatchObject({ code: 'too_small_string' });
      expect(byPath.password.message).toContain('8');
      expect(byPath.displayName.code).toBe('required');
      expect(byPath.timeZone.code).toBe('invalid_time_zone');

      const turkish = await request(getApp())
        .post(`${API}/auth/register`)
        .set('Accept-Language', 'tr-TR,tr;q=0.9')
        .send(body)
        .expect(400);
      expect(turkish.body.error.message).toBe('Girilen bilgilerin bir kısmı geçerli değil.');
      expect(turkish.body.error.details.find((d) => d.path === 'email').message).toBe(
        'Geçerli bir e-posta adresi girin.',
      );
    });

    it('rejects unknown fields and a password equal to the email', async () => {
      const email = uniqueEmail();
      const unknown = await anonymous()
        .post('/auth/register', {
          email,
          password: DEFAULT_PASSWORD,
          displayName: 'X',
          role: 'admin',
          device: deviceInput(),
        })
        .expect(400);
      expect(unknown.body.error.details[0].code).toBe('unrecognized_keys');

      const same = await anonymous()
        .post('/auth/register', { email, password: email, displayName: 'X', device: deviceInput() })
        .expect(400);
      expect(same.body.error.details[0].code).toBe('password_same_as_email');
    });
  });

  describe('login', () => {
    it('signs in with correct credentials and reuses the device record', async () => {
      const user = await registerUser();
      const again = await loginUser(user.credentials, user.device);
      expect(again.tokens.deviceId).toBe(user.tokens.deviceId);
      expect(again.tokens.sessionId).not.toBe(user.tokens.sessionId);

      // Signing in again from the same installation replaces its previous session.
      await user.get('/users/me').expect(401);
      await again.get('/users/me').expect(200);
    });

    it('answers identically for a wrong password and an unknown email', async () => {
      const user = await registerUser();
      const wrong = await anonymous()
        .post('/auth/login', {
          email: user.credentials.email,
          password: 'wrong password',
          device: deviceInput(),
        })
        .expect(401);
      const unknown = await anonymous()
        .post('/auth/login', {
          email: uniqueEmail('ghost'),
          password: 'wrong password',
          device: deviceInput(),
        })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error).toMatchObject({
        code: wrong.body.error.code,
        message: wrong.body.error.message,
      });
    });
  });

  describe('refresh token rotation', () => {
    it('issues a new pair and invalidates the presented token', async () => {
      const user = await registerUser();
      const first = await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(200);
      const tokens = first.body.data;
      expect(tokens.refreshToken).not.toBe(user.tokens.refreshToken);
      expect(tokens.sessionId).toBe(user.tokens.sessionId);

      await request(getApp())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      const second = await anonymous()
        .post('/auth/refresh', { refreshToken: tokens.refreshToken })
        .expect(200);
      expect(second.body.data.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('rejects a racing duplicate without closing the session', async () => {
      const user = await registerUser();
      await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(200);
      const duplicate = await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(401);
      expect(duplicate.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      const session = await Session.findById(user.tokens.sessionId).lean();
      expect(session.revokedAt).toBeNull();
    });

    it('closes the session when a rotated token is replayed later', async () => {
      const user = await registerUser();
      const rotated = await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(200);
      // Move the rotation outside the grace window.
      await Session.updateOne(
        { _id: user.tokens.sessionId },
        { $set: { rotatedAt: new Date(Date.now() - 60_000) } },
      );

      const replay = await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(401);
      expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

      // The legitimate holder of the newest token is signed out as well.
      const afterwards = await anonymous()
        .post('/auth/refresh', { refreshToken: rotated.body.data.refreshToken })
        .expect(401);
      expect(afterwards.body.error.code).toBe('INVALID_REFRESH_TOKEN');
      await request(getApp())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${rotated.body.data.accessToken}`)
        .expect(401);
    });

    it('rejects unknown, missing and expired refresh tokens', async () => {
      await anonymous().post('/auth/refresh', { refreshToken: 'made-up' }).expect(401);
      const missing = await anonymous().post('/auth/refresh', {}).expect(401);
      expect(missing.body.error.code).toBe('INVALID_REFRESH_TOKEN');

      const user = await registerUser();
      await Session.updateOne(
        { _id: user.tokens.sessionId },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
      await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(401);
      await user.get('/users/me').expect(401);
    });

    it('rotates through the cookie for browser clients', async () => {
      const agent = request.agent(getApp());
      const registered = await agent
        .post(`${API}/auth/register`)
        .send({
          email: uniqueEmail(),
          password: DEFAULT_PASSWORD,
          displayName: 'Web',
          device: deviceInput({ clientType: 'web', platform: 'web', appId: 'personalitify-web' }),
        })
        .expect(201);
      const refreshed = await agent.post(`${API}/auth/refresh`).send({}).expect(200);
      expect(refreshed.body.data.refreshToken).toBeNull();
      expect(refreshed.body.data.accessToken).not.toBe(registered.body.data.tokens.accessToken);
      expect(refreshed.headers['set-cookie'][0]).toMatch(/^pfy_refresh=/);
    });
  });

  describe('sessions', () => {
    it('logs out the current session immediately', async () => {
      const user = await registerUser();
      await user.post('/auth/logout').expect(204);
      const response = await user.get('/users/me').expect(401);
      expect(response.body.error.code).toBe('SESSION_REVOKED');
      await anonymous()
        .post('/auth/refresh', { refreshToken: user.tokens.refreshToken })
        .expect(401);
    });

    it('lists sessions per device and revokes a chosen one', async () => {
      const desktop = await registerUser();
      const phone = await loginUser(
        desktop.credentials,
        deviceInput({ name: 'Phone', clientType: 'mobile', platform: 'android' }),
      );

      const list = await desktop.get('/auth/sessions').expect(200);
      expect(list.body.data).toHaveLength(2);
      const current = list.body.data.find((session) => session.current);
      expect(current.id).toBe(desktop.tokens.sessionId);
      const other = list.body.data.find((session) => !session.current);
      expect(other.device).toMatchObject({ name: 'Phone', platform: 'android' });

      await desktop.delete(`/auth/sessions/${other.id}`).expect(204);
      await phone.get('/users/me').expect(401);
      await desktop.get('/users/me').expect(200);
    });

    it('signs out everywhere', async () => {
      const first = await registerUser();
      const second = await loginUser(first.credentials);
      const response = await first.post('/auth/logout-all').expect(200);
      expect(response.body.data.revokedSessions).toBe(2);
      await first.get('/users/me').expect(401);
      await second.get('/users/me').expect(401);
    });
  });

  describe('email verification', () => {
    it('verifies with the emailed token exactly once', async () => {
      const user = await registerUser();
      const [message] = sentMessages();
      expect(message.to).toBe(user.credentials.email);
      expect(message.subject).toBe('Confirm your email address');
      const token = tokenFromLastEmail();

      // Only a hash of the token is stored.
      const stored = await AuthToken.findOne({ userId: user.userId }).lean();
      expect(stored.tokenHash).not.toBe(token);

      const verified = await anonymous().post('/auth/verify-email', { token }).expect(200);
      expect(verified.body.data.emailVerified).toBe(true);

      const again = await anonymous().post('/auth/verify-email', { token }).expect(400);
      expect(again.body.error.code).toBe('INVALID_TOKEN');

      const resend = await user.post('/auth/resend-verification').expect(409);
      expect(resend.body.error.code).toBe('EMAIL_ALREADY_VERIFIED');
    });

    it('sends a new link on request and writes the email in the account language', async () => {
      const user = await registerUser({ language: 'tr' });
      expect(sentMessages()[0].subject).toBe('E-posta adresinizi doğrulayın');
      const firstToken = tokenFromLastEmail();

      await user.post('/auth/resend-verification').expect(204);
      expect(sentMessages()).toHaveLength(2);
      // The earlier link stops working.
      await anonymous().post('/auth/verify-email', { token: firstToken }).expect(400);
      await anonymous().post('/auth/verify-email', { token: tokenFromLastEmail() }).expect(200);
    });
  });

  describe('password reset and change', () => {
    it('does not reveal whether an email is registered', async () => {
      await anonymous()
        .post('/auth/forgot-password', { email: uniqueEmail('nobody') })
        .expect(204);
      expect(sentMessages()).toHaveLength(0);
    });

    it('resets the password with the emailed token and signs out every session', async () => {
      const user = await registerUser();
      clearSentMessages();
      await anonymous()
        .post('/auth/forgot-password', { email: user.credentials.email })
        .expect(204);
      const token = tokenFromLastEmail();

      const weak = await anonymous()
        .post('/auth/reset-password', { token, password: 'short' })
        .expect(400);
      expect(weak.body.error.code).toBe('VALIDATION_FAILED');

      await anonymous()
        .post('/auth/reset-password', { token, password: 'a brand new password' })
        .expect(204);
      await user.get('/users/me').expect(401);

      await anonymous()
        .post('/auth/reset-password', { token, password: 'another password!' })
        .expect(400);
      await anonymous()
        .post('/auth/login', { ...user.credentials, device: deviceInput() })
        .expect(401);
      await loginUser({ email: user.credentials.email, password: 'a brand new password' });
      expect(sentMessages().at(-1).subject).toBe('Your password was changed');
    });

    it('rejects an expired reset token', async () => {
      const user = await registerUser();
      await anonymous()
        .post('/auth/forgot-password', { email: user.credentials.email })
        .expect(204);
      const token = tokenFromLastEmail();
      await AuthToken.updateMany(
        { userId: user.userId, type: 'password-reset' },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
      const response = await anonymous()
        .post('/auth/reset-password', { token, password: 'a brand new password' })
        .expect(400);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('changes the password, keeps the current session and ends the others', async () => {
      const first = await registerUser();
      const second = await loginUser(first.credentials);

      const wrong = await first
        .post('/auth/change-password', {
          currentPassword: 'not my password',
          newPassword: 'a brand new password',
        })
        .expect(400);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

      const unchanged = await first
        .post('/auth/change-password', {
          currentPassword: DEFAULT_PASSWORD,
          newPassword: DEFAULT_PASSWORD,
        })
        .expect(400);
      expect(unchanged.body.error.details[0].code).toBe('password_unchanged');

      const changed = await first
        .post('/auth/change-password', {
          currentPassword: DEFAULT_PASSWORD,
          newPassword: 'a brand new password',
        })
        .expect(200);
      expect(changed.body.data.revokedSessions).toBe(1);
      await first.get('/users/me').expect(200);
      await second.get('/users/me').expect(401);
    });
  });
});
