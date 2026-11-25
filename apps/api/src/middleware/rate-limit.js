import { ERROR_CODES } from '@personalitify/shared-contracts';
import { MemoryStore, rateLimit } from 'express-rate-limit';
import { getConfig } from '../config/env.js';
import { AppError } from '../core/errors.js';

/**
 * Request limits per client address. Kept in process memory: sufficient for a single
 * instance and for local development, with no external store to operate.
 */
const limits = {
  enabled: !getConfig().isTest,
  general: { windowMs: 60_000, max: 300 },
  // Credential endpoints: slow down password guessing and token brute force.
  auth: { windowMs: 60_000, max: 10 },
  // Session restore runs on every page load and in every tab. Refresh tokens are 384 random
  // bits, so guessing is not a concern; the limit only caps abuse.
  refresh: { windowMs: 60_000, max: 60 },
  // One push carries up to a hundred operations; it is counted far more strictly than a
  // single request.
  push: { windowMs: 60_000, max: 30 },
};

const stores = [];

function createLimiter(name) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    store,
    windowMs: limits[name].windowMs,
    limit: () => limits[name].max,
    skip: () => !limits.enabled,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      next(
        new AppError(429, ERROR_CODES.RATE_LIMITED, {
          headers: { 'Retry-After': String(Math.ceil(options.windowMs / 1000)) },
        }),
      );
    },
  });
}

export const generalRateLimit = createLimiter('general');
export const authRateLimit = createLimiter('auth');
export const refreshRateLimit = createLimiter('refresh');
export const pushRateLimit = createLimiter('push');

/** Test hook: adjust limits and start counting from zero. */
export function configureRateLimits({ enabled, generalMax, authMax, refreshMax, pushMax } = {}) {
  if (enabled !== undefined) limits.enabled = enabled;
  if (generalMax !== undefined) limits.general.max = generalMax;
  if (authMax !== undefined) limits.auth.max = authMax;
  if (refreshMax !== undefined) limits.refresh.max = refreshMax;
  if (pushMax !== undefined) limits.push.max = pushMax;
  for (const store of stores) store.resetAll();
}
