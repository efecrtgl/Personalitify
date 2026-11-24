import { translate } from '@personalitify/localization';
import { ERROR_CODES } from '@personalitify/shared-contracts';
import mongoose from 'mongoose';
import { AppError } from '../core/errors.js';
import { logger } from '../core/logger.js';

/** Maps errors raised outside our own code to AppErrors. Returns null for unknown errors. */
function normalize(error) {
  if (error instanceof AppError) return error;

  if (error?.type === 'entity.parse.failed') {
    return new AppError(400, ERROR_CODES.MALFORMED_JSON);
  }
  if (error?.type === 'entity.too.large') {
    return new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE);
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return new AppError(400, ERROR_CODES.VALIDATION_FAILED, {
      details: Object.values(error.errors).map((issue) => ({
        path: issue.path,
        code: 'invalid',
        messageKey: 'errors:validation.invalid',
      })),
    });
  }
  if (error instanceof mongoose.Error.CastError) {
    return new AppError(400, ERROR_CODES.VALIDATION_FAILED, {
      details: [{ path: error.path, code: 'invalid', messageKey: 'errors:validation.invalid' }],
    });
  }
  return null;
}

function localizeDetails(details, language) {
  if (!Array.isArray(details)) return details;
  return details.map(({ messageKey, params, ...rest }) => ({
    ...rest,
    message: messageKey ? translate(language, messageKey, params) : undefined,
  }));
}

export function notFoundHandler(req, res, next) {
  next(new AppError(404, ERROR_CODES.ROUTE_NOT_FOUND));
}

/**
 * Single exit point for failures. Known errors are reported with their stable code and a
 * localized message; anything unexpected is logged in full and reported as INTERNAL_ERROR
 * without leaking internals.
 */
// Express identifies error handlers by their four parameters.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const known = normalize(error);
  const language = req.language;

  if (!known) {
    logger.error({ err: error, requestId: req.id, path: req.originalUrl }, 'Unhandled error');
    res.status(500).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: translate(language, `errors:${ERROR_CODES.INTERNAL_ERROR}`),
        requestId: req.id,
      },
    });
    return;
  }

  if (known.headers) res.set(known.headers);
  res.status(known.status).json({
    error: {
      code: known.code,
      message: translate(language, known.messageKey, known.params),
      ...(known.details !== undefined ? { details: localizeDetails(known.details, language) } : {}),
      requestId: req.id,
    },
  });
}
