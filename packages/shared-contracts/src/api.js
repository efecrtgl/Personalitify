/** Current major version of the HTTP API. */
export const API_VERSION = 'v1';

/** Path prefix shared by every endpoint of the current API version. */
export const API_PREFIX = `/api/${API_VERSION}`;

/** Application identifiers used by update manifests and remote configuration. */
export const APP_IDS = Object.freeze({
  WEB: 'personalitify-web',
  DESKTOP: 'personalitify-desktop',
  MOBILE: 'personalitify-mobile',
});

/** Kinds of client that can register a device. */
export const CLIENT_TYPES = Object.freeze(['web', 'desktop', 'mobile', 'integration']);

/** Operating platforms a device may report. */
export const PLATFORMS = Object.freeze(['web', 'windows', 'macos', 'linux', 'android', 'ios']);
