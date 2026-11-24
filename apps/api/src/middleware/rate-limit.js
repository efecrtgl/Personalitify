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

/** Test hook: adjust limits and start counting from zero. */
export function configureRateLimits({ enabled, generalMax, authMax } = {}) {
  if (enabled !== undefined) limits.enabled = enabled;
  if (generalMax !== undefined) limits.general.max = generalMax;
  if (authMax !== undefined) limits.auth.max = authMax;
  for (const store of stores) store.resetAll();
}
