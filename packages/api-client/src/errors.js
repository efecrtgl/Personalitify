/** Client-side error codes for failures that never reached the API. */
export const CLIENT_ERROR_CODES = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  ABORTED: 'ABORTED',
});

/**
 * A failed API call. `code` is the stable error code from the API (or one of
 * CLIENT_ERROR_CODES); `message` is already localized by the server.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details, requestId, cause }) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code;
    this.details = details;
    this.requestId = requestId ?? null;
    this.cause = cause;
  }

  /** Validation problems keyed by field path, for showing next to form inputs. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    const result = {};
    for (const detail of this.details) {
      if (detail?.path && result[detail.path] === undefined) {
        result[detail.path] = detail.message ?? detail.code;
      }
    }
    return result;
  }

  get isNetworkError() {
    return this.code === CLIENT_ERROR_CODES.NETWORK_ERROR;
  }
}
