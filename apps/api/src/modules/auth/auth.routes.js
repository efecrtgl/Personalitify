import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { idSchema } from '../../core/validation.js';
import { authRateLimit, refreshRateLimit } from '../../middleware/rate-limit.js';
import { userSchema } from '../users/users.schemas.js';
import {
  authResultSchema,
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  refreshBody,
  registerBody,
  resetPasswordBody,
  revokedCountSchema,
  sessionSchema,
  tokenBody,
  tokensSchema,
} from './auth.schemas.js';
import * as authService from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.js';
import { listSessions, revokeSession } from './session.service.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';

const auth = createModule({
  tag: 'Authentication',
  description:
    'Registration, sign-in, token refresh and session management. Access tokens are ' +
    'short-lived JWTs; refresh tokens are opaque, single-use and rotated on every refresh. ' +
    'Browser clients (`clientType: "web"`) receive the refresh token as an HttpOnly cookie; ' +
    'all other clients receive it in the response body.',
  basePath: '/auth',
});

/**
 * Browser clients must never be able to read the refresh token from JavaScript, so for them
 * it travels in a cookie and is removed from the response body.
 */
function deliverTokens(res, tokens, viaCookie) {
  if (!viaCookie) return tokens;
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  return { ...tokens, refreshToken: null };
}

auth.post(
  '/register',
  {
    summary: 'Create an account',
    description:
      'Creates the account, its profile and settings, registers the device and signs it in. ' +
      'A verification email is sent.',
    auth: 'none',
    body: registerBody,
    response: authResultSchema,
    status: 201,
    errors: ['EMAIL_ALREADY_REGISTERED', 'VALIDATION_FAILED', 'RATE_LIMITED'],
    middleware: [authRateLimit],
  },
  async ({ body, req, res }) => {
    const result = await authService.register(body, req.client);
    return {
      ...result,
      tokens: deliverTokens(res, result.tokens, body.device.clientType === 'web'),
    };
  },
);

auth.post(
  '/login',
  {
    summary: 'Sign in',
    description: 'Registers or refreshes the device and opens a session for it.',
    auth: 'none',
    body: loginBody,
    response: authResultSchema,
    errors: ['INVALID_CREDENTIALS', 'VALIDATION_FAILED', 'RATE_LIMITED'],
    middleware: [authRateLimit],
  },
  async ({ body, req, res }) => {
    const result = await authService.login(body, req.client);
    return {
      ...result,
      tokens: deliverTokens(res, result.tokens, body.device.clientType === 'web'),
    };
  },
);

auth.post(
  '/refresh',
  {
    summary: 'Exchange a refresh token for a new token set',
    description:
      'The presented refresh token becomes invalid immediately. Presenting an already used ' +
      'token closes the session (`REFRESH_TOKEN_REUSED`), except within a few seconds of the ' +
      'rotation, where a racing duplicate request is simply rejected.',
    auth: 'none',
    body: refreshBody,
    response: tokensSchema,
    errors: ['INVALID_REFRESH_TOKEN', 'REFRESH_TOKEN_REUSED', 'RATE_LIMITED'],
    middleware: [refreshRateLimit],
  },
  async ({ body, req, res }) => {
    const fromCookie = body.refreshToken === undefined;
    const presented = fromCookie ? readRefreshCookie(req) : body.refreshToken;
    try {
      const tokens = await authService.refresh(presented, req.client);
      return deliverTokens(res, tokens, fromCookie);
    } catch (error) {
      if (fromCookie) clearRefreshCookie(res);
      throw error;
    }
  },
);

auth.post(
  '/logout',
  { summary: 'Sign out of the current session', status: 204 },
  async ({ auth: caller, req, res }) => {
    await authService.logout(caller, req.client);
    clearRefreshCookie(res);
  },
);

auth.post(
  '/logout-all',
  {
    summary: 'Sign out of every session on every device',
    response: revokedCountSchema,
  },
  async ({ auth: caller, req, res }) => {
    const result = await authService.logoutEverywhere(caller, req.client);
    clearRefreshCookie(res);
    return result;
  },
);

auth.post(
  '/verify-email',
  {
    summary: 'Confirm an email address with the emailed token',
    auth: 'none',
    body: tokenBody,
    response: userSchema,
    errors: ['INVALID_TOKEN'],
    middleware: [authRateLimit],
  },
  ({ body, req }) => authService.verifyEmail(body.token, req.client),
);

auth.post(
  '/resend-verification',
  {
    summary: 'Send the verification email again',
    status: 204,
    errors: ['EMAIL_ALREADY_VERIFIED'],
    middleware: [authRateLimit],
  },
  ({ auth: caller }) => authService.resendVerification(caller),
);

auth.post(
  '/forgot-password',
  {
    summary: 'Request a password reset email',
    description:
      'Always answers 204, whether or not the address belongs to an account, so the endpoint ' +
      'cannot be used to discover registered emails.',
    auth: 'none',
    body: forgotPasswordBody,
    status: 204,
    middleware: [authRateLimit],
  },
  ({ body, req }) => authService.requestPasswordReset(body.email, req.client),
);

auth.post(
  '/reset-password',
  {
    summary: 'Set a new password with the emailed token',
    description: 'Signs the account out of every session.',
    auth: 'none',
    body: resetPasswordBody,
    status: 204,
    errors: ['INVALID_TOKEN', 'VALIDATION_FAILED'],
    middleware: [authRateLimit],
  },
  ({ body, req }) => authService.resetPassword(body, req.client),
);

auth.post(
  '/change-password',
  {
    summary: 'Change the password of the signed-in account',
    description: 'Every other session is signed out; the current one stays valid.',
    body: changePasswordBody,
    response: revokedCountSchema,
    errors: ['INVALID_CREDENTIALS', 'VALIDATION_FAILED'],
    middleware: [authRateLimit],
  },
  ({ auth: caller, body, req }) => authService.changePassword(caller, body, req.client),
);

auth.get(
  '/sessions',
  { summary: 'List active sessions', response: z.array(sessionSchema) },
  ({ auth: caller }) => listSessions(caller.userId, caller.sessionId),
);

auth.delete(
  '/sessions/:sessionId',
  {
    summary: 'Revoke one session',
    params: z.strictObject({ sessionId: idSchema }),
    status: 204,
    errors: ['NOT_FOUND'],
  },
  async ({ auth: caller, params, req }) => {
    await revokeSession(caller.userId, params.sessionId, 'revoked_by_user');
    await recordAudit(AUDIT_ACTIONS.SESSION_REVOKED, {
      ...caller,
      client: req.client,
      metadata: { revokedSessionId: params.sessionId },
    });
  },
);

export const authRouter = auth.router;
