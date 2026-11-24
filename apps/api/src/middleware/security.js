import { ERROR_CODES } from '@personalitify/shared-contracts';
import cors from 'cors';
import helmet from 'helmet';
import { getConfig } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { findForbiddenKey } from '../core/validation.js';

/** Security headers. The API serves JSON only, so the content policy forbids everything. */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: getConfig().isProduction,
  });
}

/**
 * Cross-origin access for browser clients only from configured origins. Native clients do
 * not send an Origin header and are unaffected.
 */
export function corsPolicy() {
  const allowed = new Set(getConfig().webOrigins);
  return cors({
    origin(origin, callback) {
      callback(null, !origin || allowed.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });
}

/**
 * Rejects input whose keys could be interpreted by MongoDB as operators (`$gt`) or paths
 * (`a.b`). Schemas already whitelist fields; this is a second, schema-independent barrier.
 */
export function rejectOperatorKeys(req, res, next) {
  const key = findForbiddenKey(req.body) ?? findForbiddenKey(req.query);
  if (key) {
    throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, {
      details: [
        { path: key, code: 'forbidden_key', messageKey: 'errors:validation.forbidden_key' },
      ],
    });
  }
  next();
}

/** State-changing requests must carry JSON, which browsers cannot send cross-site by form. */
export function requireJsonBody(req, res, next) {
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
  if (hasBody && !req.is('application/json')) {
    throw new AppError(415, ERROR_CODES.VALIDATION_FAILED, {
      details: [
        {
          path: 'Content-Type',
          code: 'invalid_format',
          messageKey: 'errors:validation.invalid_format',
        },
      ],
    });
  }
  next();
}
