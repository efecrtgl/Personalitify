import {
  ERROR_CODES,
  RELEASE_PLATFORM_ANY,
  REMOTE_CONFIG_DEFAULTS,
  REMOTE_CONFIG_KEYS,
  compareVersions,
  inRollout,
} from '@personalitify/shared-contracts';
import { conflict, fieldError, notFound } from '../../core/errors.js';
import { AUDIT_ACTIONS } from '../audit/audit-log.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { AppRelease, RemoteConfigEntry, serializeRelease } from './platform.model.js';

// --- Updates ---------------------------------------------------------------------------

const newestFirst = (a, b) => compareVersions(b.version, a.version);

/**
 * Tells a client whether a newer version of itself exists and whether it may keep running.
 *
 * - `updateAvailable`: a published release newer than `version` is offered to this
 *   installation (its platform, its channel, inside the rollout).
 * - `mandatory`: one of the releases the client would skip is marked mandatory, or the
 *   client is older than the oldest version that is still supported.
 * - `supported`: false when the client is older than `minSupportedVersion`; it should stop
 *   and ask for the update. This does not depend on the rollout: an unsupported client is
 *   unsupported for everyone.
 */
export async function checkForUpdate({ appId, platform, version, channel, installationId }) {
  const channels = channel === 'beta' ? ['stable', 'beta'] : ['stable'];
  const published = await AppRelease.find({
    appId,
    platform: { $in: [platform, RELEASE_PLATFORM_ANY] },
    channel: { $in: channels },
    publishedAt: { $ne: null, $lte: new Date() },
  }).lean();

  const minSupported = published
    .map((release) => release.minSupportedVersion)
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a))[0];
  const supported = !minSupported || compareVersions(version, minSupported) >= 0;

  const offered = published
    .filter((release) => compareVersions(release.version, version) > 0)
    .filter((release) => inRollout(installationId, String(release._id), release.rolloutPercent))
    .sort(newestFirst);
  const latest = offered[0] ?? null;

  return {
    appId,
    platform,
    channel,
    currentVersion: version,
    supported,
    minSupportedVersion: minSupported ?? null,
    updateAvailable: Boolean(latest),
    mandatory: !supported || offered.some((release) => release.mandatory),
    latest: latest
      ? {
          version: latest.version,
          channel: latest.channel,
          notes: { tr: latest.notes?.tr ?? '', en: latest.notes?.en ?? '' },
          downloadUrl: latest.downloadUrl ?? null,
          sha256: latest.sha256 ?? null,
          sizeBytes: latest.sizeBytes ?? null,
          publishedAt: latest.publishedAt.toISOString(),
        }
      : null,
    checkedAt: new Date().toISOString(),
  };
}

function assertRelease(release) {
  if (
    release.minSupportedVersion &&
    compareVersions(release.minSupportedVersion, release.version) > 0
  ) {
    throw fieldError('minSupportedVersion', 'invalid_value');
  }
}

const auditAdmin = (auth, client, metadata) =>
  recordAudit(AUDIT_ACTIONS.ADMIN_CHANGE, { ...auth, client, metadata });

export async function listReleases({ appId } = {}) {
  const releases = await AppRelease.find(appId ? { appId } : {}).sort({ createdAt: -1 });
  return releases.map(serializeRelease);
}

export async function createRelease(auth, { published, ...input }, client) {
  assertRelease(input);
  let release;
  try {
    release = await AppRelease.create({ ...input, publishedAt: published ? new Date() : null });
  } catch (error) {
    if (error?.code === 11000) throw conflict(ERROR_CODES.CONFLICT);
    throw error;
  }
  await auditAdmin(auth, client, { change: 'release.created', releaseId: String(release._id) });
  return serializeRelease(release);
}

export async function updateRelease(auth, id, { published, notes, ...patch }, client) {
  const release = await AppRelease.findById(id);
  if (!release) throw notFound();
  Object.assign(release, patch);
  if (notes?.tr !== undefined) release.notes.tr = notes.tr;
  if (notes?.en !== undefined) release.notes.en = notes.en;
  if (published !== undefined && published !== Boolean(release.publishedAt)) {
    release.publishedAt = published ? new Date() : null;
  }
  assertRelease(release);
  await release.save();
  await auditAdmin(auth, client, { change: 'release.updated', releaseId: id });
  return serializeRelease(release);
}

export async function deleteRelease(auth, id, client) {
  const { deletedCount } = await AppRelease.deleteOne({ _id: id });
  if (deletedCount === 0) throw notFound();
  await auditAdmin(auth, client, { change: 'release.deleted', releaseId: id });
}

// --- Remote configuration --------------------------------------------------------------

/** The value of every key for one client: the server's where it applies, else the default. */
export async function getClientConfig({ appId, installationId } = {}) {
  const entries = await RemoteConfigEntry.find({ enabled: true }).lean();
  const values = { ...REMOTE_CONFIG_DEFAULTS };
  for (const entry of entries) {
    if (!REMOTE_CONFIG_KEYS.includes(entry._id)) continue;
    if (entry.appIds.length > 0 && !entry.appIds.includes(appId)) continue;
    if (!inRollout(installationId, `config:${entry._id}`, entry.rolloutPercent)) continue;
    values[entry._id] = entry.value;
  }
  return { values, fetchedAt: new Date().toISOString() };
}

/** The value of one key as the server itself should act on it (no rollout, no targeting). */
export async function getServerConfigValue(key) {
  const entry = await RemoteConfigEntry.findById(key).lean();
  return entry?.enabled ? entry.value : REMOTE_CONFIG_DEFAULTS[key];
}

/** Every known key with what is stored for it, for the administration screen. */
export async function listConfig() {
  const entries = await RemoteConfigEntry.find().lean();
  const byKey = new Map(entries.map((entry) => [entry._id, entry]));
  return REMOTE_CONFIG_KEYS.map((key) => {
    const entry = byKey.get(key);
    return {
      key,
      defaultValue: REMOTE_CONFIG_DEFAULTS[key],
      overridden: Boolean(entry),
      value: entry ? entry.value : REMOTE_CONFIG_DEFAULTS[key],
      enabled: entry?.enabled ?? false,
      rolloutPercent: entry?.rolloutPercent ?? 100,
      appIds: entry?.appIds ?? [],
      description: entry?.description ?? '',
      updatedAt: entry?.updatedAt ? entry.updatedAt.toISOString() : null,
    };
  });
}

export async function setConfig(auth, key, input, client) {
  await RemoteConfigEntry.findOneAndUpdate(
    { _id: key },
    { $set: { ...input, updatedBy: auth.userId } },
    { upsert: true, runValidators: true },
  );
  await auditAdmin(auth, client, { change: 'config.set', key });
  return (await listConfig()).find((entry) => entry.key === key);
}

/** Removes the server's value: the key has its default again. */
export async function resetConfig(auth, key, client) {
  await RemoteConfigEntry.deleteOne({ _id: key });
  await auditAdmin(auth, client, { change: 'config.reset', key });
  return (await listConfig()).find((entry) => entry.key === key);
}
