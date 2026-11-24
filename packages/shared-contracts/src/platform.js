/**
 * Application updates and remote configuration: what a client asks the server about itself.
 */

/** A release is published to one channel; `beta` clients also see `stable` releases. */
export const RELEASE_CHANNELS = Object.freeze(['stable', 'beta']);

/** A release targets one platform or, with `any`, every platform of its application. */
export const RELEASE_PLATFORM_ANY = 'any';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** True for versions of the form `major.minor.patch`. */
export const isValidVersion = (version) => VERSION.test(String(version ?? ''));

/**
 * Compares two `major.minor.patch` versions.
 * @returns {number} negative when `a` is older, positive when newer, 0 when equal.
 */
export function compareVersions(a, b) {
  const left = VERSION.exec(a);
  const right = VERSION.exec(b);
  if (!left || !right) throw new TypeError(`Not a version: ${left ? b : a}`);
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Settings the server can change for running clients without a new release.
 *
 * Each key has a default that applies when the server says nothing, so a client that
 * cannot reach the configuration endpoint behaves exactly as designed.
 */
export const REMOTE_CONFIG_DEFAULTS = Object.freeze({
  /**
   * A message shown to everyone at the top of the application, or null.
   * `{ id, tone: 'info' | 'warning', message: { tr, en } }` — `id` lets a client remember
   * that the user dismissed this particular message.
   */
  announcement: null,
  /** Whether new accounts can be created. Enforced by the server, not only hidden. */
  registrationOpen: true,
});

export const REMOTE_CONFIG_KEYS = Object.freeze(Object.keys(REMOTE_CONFIG_DEFAULTS));

export const ANNOUNCEMENT_TONES = Object.freeze(['info', 'warning']);

/**
 * Places an installation in one of 100 buckets, the same one every time, so that a gradual
 * rollout reaches a stable share of installations. `salt` separates rollouts from each
 * other: being early for one release says nothing about the next.
 */
export function rolloutBucket(installationId, salt) {
  const text = `${salt}:${installationId}`;
  // FNV-1a: small, fast and evenly spread, which is all a rollout needs.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

/** True when a rollout of `percent` (0–100) includes the installation. */
export function inRollout(installationId, salt, percent) {
  if (percent >= 100) return true;
  if (percent <= 0 || !installationId) return false;
  return rolloutBucket(installationId, salt) < percent;
}
