import { ERROR_CODES } from '@personalitify/shared-contracts';

/**
 * An error that is safe to report to API clients.
 * `code` is the stable contract; the human-readable message is resolved from the
 * localization catalog (`errors:<code>` unless `messageKey` says otherwise).
 */
export class AppError extends Error {
  constructor(status, code, { messageKey, params, details, headers, cause } = {}) {
    super(code);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.messageKey = messageKey ?? `errors:${code}`;
    this.params = params ?? {};
    this.details = details;
    this.headers = headers;
    this.cause = cause;
  }
}

export const badRequest = (code = ERROR_CODES.VALIDATION_FAILED, options) =>
  new AppError(400, code, options);

export const unauthenticated = (code = ERROR_CODES.UNAUTHENTICATED, options) =>
  new AppError(401, code, options);

export const forbidden = (options) => new AppError(403, ERROR_CODES.FORBIDDEN, options);

export const notFound = (options) => new AppError(404, ERROR_CODES.NOT_FOUND, options);

export const conflict = (code = ERROR_CODES.CONFLICT, options) => new AppError(409, code, options);

export const invalidState = (options) => new AppError(409, ERROR_CODES.INVALID_STATE, options);

export const limitExceeded = (options) => new AppError(422, ERROR_CODES.LIMIT_EXCEEDED, options);

/**
 * A single-field validation failure raised by domain logic (as opposed to schema parsing).
 * `messageKey` points into the `errors:validation.*` catalog.
 */
export function fieldError(path, messageKey, params) {
  return new AppError(400, ERROR_CODES.VALIDATION_FAILED, {
    details: [{ path, code: messageKey, messageKey: `errors:validation.${messageKey}`, params }],
  });
}
