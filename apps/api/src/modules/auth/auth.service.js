import { ERROR_CODES } from '@personalitify/shared-contracts';
import {
  generateToken,
  hashPassword,
  hashToken,
  passwordNeedsRehash,
  verifyPassword,
} from '../../core/crypto.js';
import {
  AppError,
  badRequest,
  conflict,
  fieldError,
  registrationClosed,
  unauthenticated,
} from '../../core/errors.js';
import { registerUserCollection } from '../../core/user-data.js';
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../../services/mailer.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { registerDevice } from '../devices/devices.service.js';
import { getServerConfigValue } from '../platform/platform.service.js';
import { getUserPreferences, settingsService } from '../settings/settings.service.js';
import { Profile } from '../users/profile.model.js';
import { User, serializeUser } from '../users/user.model.js';
import { profileService } from '../users/users.service.js';
import { signAccessToken } from './access-token.js';
import { AUTH_TOKEN_TYPES, AuthToken } from './auth-token.model.js';
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from './session.service.js';

registerUserCollection({ key: 'authTokens', model: AuthToken });

const VERIFICATION_TTL_HOURS = 48;
const RESET_TTL_MINUTES = 30;

// Verified against when the account does not exist, so that a login attempt takes the same
// time whether or not the email is registered.
let decoyHash;
async function getDecoyHash() {
  decoyHash ??= await hashPassword(generateToken(16));
  return decoyHash;
}

async function issueTokens(user, session, refreshToken) {
  const access = await signAccessToken({
    userId: String(user._id),
    sessionId: String(session._id),
    deviceId: session.deviceId,
    role: user.role,
  });
  return {
    accessToken: access.token,
    tokenType: 'Bearer',
    expiresIn: access.expiresIn,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
    sessionId: String(session._id),
    deviceId: session.deviceId,
  };
}

async function createEmailToken(userId, type, ttlMs) {
  // A new link invalidates earlier unused ones of the same kind.
  await AuthToken.deleteMany({ userId, type, usedAt: null });
  const token = generateToken(32);
  await AuthToken.create({
    userId,
    type,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

/** Marks a token as used and returns it, or throws INVALID_TOKEN. Atomic: single use. */
async function consumeEmailToken(token, type) {
  const record = await AuthToken.findOneAndUpdate(
    { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!record) throw badRequest(ERROR_CODES.INVALID_TOKEN);
  return record;
}

async function sendVerification(user, name, language) {
  const token = await createEmailToken(
    String(user._id),
    AUTH_TOKEN_TYPES.EMAIL_VERIFICATION,
    VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
  );
  await sendVerificationEmail({
    to: user.email,
    name,
    language,
    token,
    hours: VERIFICATION_TTL_HOURS,
  });
}

function assertPasswordAllowed(password, email) {
  if (password.toLowerCase() === email.toLowerCase()) {
    throw fieldError('password', 'password_same_as_email');
  }
}

export async function register(input, client) {
  // Checked on the server: hiding the form in a client would not close registration.
  if ((await getServerConfigValue('registrationOpen')) === false) throw registrationClosed();
  const email = input.email.toLowerCase();
  assertPasswordAllowed(input.password, email);

  let user;
  try {
    user = await User.create({ email, passwordHash: await hashPassword(input.password) });
  } catch (error) {
    if (error?.code === 11000) throw conflict(ERROR_CODES.EMAIL_ALREADY_REGISTERED);
    throw error;
  }
  const userId = String(user._id);

  const device = await registerDevice(userId, input.device);
  const context = { userId, deviceId: String(device._id) };

  const [profile, settings] = await Promise.all([
    profileService.create(context, { displayName: input.displayName }, { id: userId }),
    settingsService.create(
      context,
      { language: input.language, timeZone: input.timeZone },
      { id: userId },
    ),
  ]);

  const { session, refreshToken } = await createSession({
    userId,
    deviceId: context.deviceId,
    client,
  });
  user.lastLoginAt = new Date();
  await user.save();

  await sendVerification(user, profile.displayName, settings.language);
  await recordAudit(AUDIT_ACTIONS.REGISTERED, {
    userId,
    sessionId: String(session._id),
    deviceId: context.deviceId,
    client,
  });

  return {
    tokens: await issueTokens(user, session, refreshToken),
    user: serializeUser(user),
    profile: profileService.serialize(profile),
    settings: settingsService.serialize(settings),
  };
}

export async function login(input, client) {
  const email = input.email.toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');

  const passwordMatches = await verifyPassword(
    input.password,
    user ? user.passwordHash : await getDecoyHash(),
  );
  if (!user || !passwordMatches) {
    if (user) {
      await recordAudit(AUDIT_ACTIONS.LOGIN_FAILED, { userId: String(user._id), client });
    }
    throw unauthenticated(ERROR_CODES.INVALID_CREDENTIALS);
  }

  if (passwordNeedsRehash(user.passwordHash)) {
    user.passwordHash = await hashPassword(input.password);
  }
  user.lastLoginAt = new Date();
  await user.save();

  const userId = String(user._id);
  const device = await registerDevice(userId, input.device);
  const deviceId = String(device._id);
  const { session, refreshToken } = await createSession({ userId, deviceId, client });
  await recordAudit(AUDIT_ACTIONS.LOGIN, {
    userId,
    sessionId: String(session._id),
    deviceId,
    client,
  });

  const context = { userId, deviceId };
  const [profile, settings] = await Promise.all([
    profileService.getById(context, userId),
    settingsService.getById(context, userId),
  ]);

  return {
    tokens: await issueTokens(user, session, refreshToken),
    user: serializeUser(user),
    profile: profileService.serialize(profile),
    settings: settingsService.serialize(settings),
  };
}

export async function refresh(refreshToken, client) {
  if (!refreshToken) throw unauthenticated(ERROR_CODES.INVALID_REFRESH_TOKEN);
  const { session, refreshToken: nextToken } = await rotateSession(refreshToken, client);
  const user = await User.findById(session.userId);
  if (!user) {
    throw unauthenticated(ERROR_CODES.INVALID_REFRESH_TOKEN);
  }
  return issueTokens(user, session, nextToken);
}

export async function logout(auth, client) {
  await revokeSession(auth.userId, auth.sessionId, 'logout');
  await recordAudit(AUDIT_ACTIONS.LOGOUT, { ...auth, client });
}

export async function logoutEverywhere(auth, client) {
  const revoked = await revokeAllSessions(auth.userId);
  await recordAudit(AUDIT_ACTIONS.LOGOUT_ALL, { ...auth, client, metadata: { revoked } });
  return { revokedSessions: revoked };
}

export async function verifyEmail(token, client) {
  const record = await consumeEmailToken(token, AUTH_TOKEN_TYPES.EMAIL_VERIFICATION);
  const user = await User.findOneAndUpdate(
    { _id: record.userId },
    { $set: { emailVerifiedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!user) throw badRequest(ERROR_CODES.INVALID_TOKEN);
  await recordAudit(AUDIT_ACTIONS.EMAIL_VERIFIED, { userId: record.userId, client });
  return serializeUser(user);
}

export async function resendVerification(auth) {
  const user = await User.findById(auth.userId);
  if (!user) throw unauthenticated();
  if (user.emailVerifiedAt) throw conflict(ERROR_CODES.EMAIL_ALREADY_VERIFIED);
  const [profile, preferences] = await Promise.all([
    Profile.findOne({ userId: auth.userId }).lean(),
    getUserPreferences(auth.userId),
  ]);
  await sendVerification(user, profile?.displayName ?? user.email, preferences?.language);
}

/**
 * Always completes without revealing whether the email is registered.
 */
export async function requestPasswordReset(email, client) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return;
  const userId = String(user._id);
  const token = await createEmailToken(
    userId,
    AUTH_TOKEN_TYPES.PASSWORD_RESET,
    RESET_TTL_MINUTES * 60 * 1000,
  );
  const [profile, preferences] = await Promise.all([
    Profile.findOne({ userId }).lean(),
    getUserPreferences(userId),
  ]);
  await sendPasswordResetEmail({
    to: user.email,
    name: profile?.displayName ?? user.email,
    language: preferences?.language,
    token,
    minutes: RESET_TTL_MINUTES,
  });
  await recordAudit(AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, { userId, client });
}

async function setPassword(user, password) {
  assertPasswordAllowed(password, user.email);
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  await user.save();
}

async function notifyPasswordChanged(user) {
  const userId = String(user._id);
  const [profile, preferences] = await Promise.all([
    Profile.findOne({ userId }).lean(),
    getUserPreferences(userId),
  ]);
  await sendPasswordChangedEmail({
    to: user.email,
    name: profile?.displayName ?? user.email,
    language: preferences?.language,
  });
}

/** Sets a new password from an emailed token and signs the account out everywhere. */
export async function resetPassword({ token, password }, client) {
  const hashed = hashToken(token);
  const pending = await AuthToken.findOne({
    tokenHash: hashed,
    type: AUTH_TOKEN_TYPES.PASSWORD_RESET,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!pending) throw badRequest(ERROR_CODES.INVALID_TOKEN);
  const user = await User.findById(pending.userId).select('+passwordHash');
  if (!user) throw badRequest(ERROR_CODES.INVALID_TOKEN);

  // Validate the new password before the token is spent, so a rejected password can be
  // corrected with the same link.
  assertPasswordAllowed(password, user.email);
  await consumeEmailToken(token, AUTH_TOKEN_TYPES.PASSWORD_RESET);
  await setPassword(user, password);

  const userId = String(user._id);
  await revokeAllSessions(userId, { reason: 'password_reset' });
  await recordAudit(AUDIT_ACTIONS.PASSWORD_RESET, { userId, client });
  await notifyPasswordChanged(user);
}

/** Changes the password and signs out every other session. */
export async function changePassword(auth, { currentPassword, newPassword }, client) {
  const user = await User.findById(auth.userId).select('+passwordHash');
  if (!user) throw unauthenticated();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, ERROR_CODES.INVALID_CREDENTIALS);
  }
  if (currentPassword === newPassword) {
    throw fieldError('newPassword', 'password_unchanged');
  }
  await setPassword(user, newPassword);
  const revoked = await revokeAllSessions(auth.userId, {
    exceptSessionId: auth.sessionId,
    reason: 'password_changed',
  });
  await recordAudit(AUDIT_ACTIONS.PASSWORD_CHANGED, { ...auth, client, metadata: { revoked } });
  await notifyPasswordChanged(user);
  return { revokedSessions: revoked };
}

/** Confirms the password of the signed-in user (used before destructive account actions). */
export async function assertPassword(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(400, ERROR_CODES.INVALID_CREDENTIALS);
  }
  return user;
}
