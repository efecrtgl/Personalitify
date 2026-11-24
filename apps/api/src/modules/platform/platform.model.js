import { randomUUID } from 'node:crypto';
import {
  APP_IDS,
  PLATFORMS,
  RELEASE_CHANNELS,
  RELEASE_PLATFORM_ANY,
  REMOTE_CONFIG_KEYS,
} from '@personalitify/shared-contracts';
import mongoose from 'mongoose';

const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * A released version of a client application. The server does not build or host
 * applications: a release is the public record that a version exists, where it can be
 * fetched, and whether older versions may keep running.
 */
const appReleaseSchema = new mongoose.Schema(
  {
    _id: { type: String, default: randomUUID },
    appId: { type: String, enum: Object.values(APP_IDS), required: true },
    platform: { type: String, enum: [RELEASE_PLATFORM_ANY, ...PLATFORMS], required: true },
    channel: { type: String, enum: RELEASE_CHANNELS, default: 'stable' },
    version: { type: String, required: true, match: VERSION },
    // Clients older than this must update before they can go on.
    minSupportedVersion: { type: String, default: null, match: VERSION },
    mandatory: { type: Boolean, default: false },
    notes: {
      tr: { type: String, default: '', maxlength: 4000 },
      en: { type: String, default: '', maxlength: 4000 },
    },
    // Where the client or the user fetches this version. Not needed for the web client.
    downloadUrl: { type: String, default: null, maxlength: 500 },
    sha256: { type: String, default: null, match: /^[0-9a-f]{64}$/ },
    sizeBytes: { type: Number, default: null, min: 0 },
    // Share of installations that are offered the release, for a gradual rollout.
    rolloutPercent: { type: Number, default: 100, min: 0, max: 100 },
    // A release without a publication date is a draft and is offered to nobody.
    publishedAt: { type: Date, default: null },
  },
  { collection: 'appReleases', versionKey: false, timestamps: true },
);

appReleaseSchema.index({ appId: 1, platform: 1, channel: 1, version: 1 }, { unique: true });
appReleaseSchema.index({ appId: 1, publishedAt: -1 });

export const AppRelease = mongoose.model('AppRelease', appReleaseSchema);

export function serializeRelease(release) {
  return {
    id: String(release._id),
    appId: release.appId,
    platform: release.platform,
    channel: release.channel,
    version: release.version,
    minSupportedVersion: release.minSupportedVersion ?? null,
    mandatory: release.mandatory,
    notes: { tr: release.notes?.tr ?? '', en: release.notes?.en ?? '' },
    downloadUrl: release.downloadUrl ?? null,
    sha256: release.sha256 ?? null,
    sizeBytes: release.sizeBytes ?? null,
    rolloutPercent: release.rolloutPercent,
    published: Boolean(release.publishedAt),
    publishedAt: release.publishedAt ? release.publishedAt.toISOString() : null,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
  };
}

/**
 * The server's value for one remote configuration key; `_id` is the key. A key without an
 * entry, or with a disabled one, has its default.
 */
const remoteConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, enum: REMOTE_CONFIG_KEYS },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    enabled: { type: Boolean, default: true },
    rolloutPercent: { type: Number, default: 100, min: 0, max: 100 },
    // Restricts the value to some applications; empty means all of them.
    appIds: { type: [{ type: String, enum: Object.values(APP_IDS) }], default: [] },
    description: { type: String, default: '', maxlength: 300 },
    updatedBy: { type: String, default: null },
  },
  { collection: 'remoteConfig', versionKey: false, timestamps: true, minimize: false },
);

export const RemoteConfigEntry = mongoose.model('RemoteConfigEntry', remoteConfigSchema);
