import { randomUUID } from 'node:crypto';
import { resolveLanguage } from '@personalitify/localization';
import { logger } from '../core/logger.js';

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/**
 * Attaches per-request context: a request id (echoed in `X-Request-Id` and in error bodies),
 * the negotiated language, client details for the security log, and structured access logs.
 */
export function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  req.language = resolveLanguage(req.get('accept-language'));
  req.client = {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 400) ?? null,
  };

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](
      {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.auth?.userId,
      },
      'request',
    );
  });

  next();
}
