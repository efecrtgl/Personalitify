import {
  ANNOUNCEMENT_TONES,
  APP_IDS,
  PLATFORMS,
  RELEASE_CHANNELS,
  RELEASE_PLATFORM_ANY,
  REMOTE_CONFIG_KEYS,
} from '@personalitify/shared-contracts';
import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { idSchema, parseOrThrow } from '../../core/validation.js';
import {
  checkForUpdate,
  createRelease,
  deleteRelease,
  getClientConfig,
  listConfig,
  listReleases,
  resetConfig,
  setConfig,
  updateRelease,
} from './platform.service.js';

const appIdSchema = z.enum(Object.values(APP_IDS));
const versionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'v:invalid_format')
  .describe('major.minor.patch');
const notesSchema = z.strictObject({ tr: z.string().max(4000), en: z.string().max(4000) });

const announcementSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(60).describe('Changes when the message changes'),
    tone: z.enum(ANNOUNCEMENT_TONES),
    message: z.strictObject({
      tr: z.string().trim().min(1).max(500),
      en: z.string().trim().min(1).max(500),
    }),
  })
  .nullable();

/** The shape each remote configuration key must have. */
const CONFIG_VALUE_SCHEMAS = {
  announcement: announcementSchema,
  registrationOpen: z.boolean(),
};

const configValuesSchema = z.strictObject({
  announcement: announcementSchema,
  registrationOpen: z.boolean(),
});

// --- For every client -------------------------------------------------------------------

const platform = createModule({
  tag: 'Platform',
  description:
    'What a client asks the server about itself: whether a newer version exists, whether ' +
    'its own version is still supported, and the settings the server can change without a ' +
    'new release. These endpoints need no sign-in, so a client can ask before the user has ' +
    'an account. The server neither builds nor hosts applications; a release is a record ' +
    'that a version exists and where it can be fetched.',
});

const clientQuery = {
  appId: appIdSchema,
  installationId: idSchema
    .optional()
    .describe('The installation’s own id; places it in gradual rollouts, always the same way'),
};

platform.get(
  '/updates/check',
  {
    summary: 'Check for a newer version',
    description:
      '`updateAvailable`: a newer published release is offered to this installation. ' +
      '`mandatory`: the client must not skip it. `supported: false`: the client is older ' +
      'than the oldest version still supported and should stop and ask for the update. ' +
      'Without `installationId` only releases rolled out to everyone are offered.',
    auth: 'none',
    query: z.strictObject({
      ...clientQuery,
      platform: z.enum(PLATFORMS),
      version: versionSchema,
      channel: z.enum(RELEASE_CHANNELS).default('stable'),
    }),
    response: z.strictObject({
      appId: appIdSchema,
      platform: z.enum(PLATFORMS),
      channel: z.enum(RELEASE_CHANNELS),
      currentVersion: z.string(),
      supported: z.boolean(),
      minSupportedVersion: z.string().nullable(),
      updateAvailable: z.boolean(),
      mandatory: z.boolean(),
      latest: z
        .strictObject({
          version: z.string(),
          channel: z.enum(RELEASE_CHANNELS),
          notes: notesSchema,
          downloadUrl: z.string().nullable(),
          sha256: z.string().nullable().describe('Checksum of the download, when one is given'),
          sizeBytes: z.number().nullable(),
          publishedAt: z.string(),
        })
        .nullable(),
      checkedAt: z.string(),
    }),
  },
  ({ query }) => checkForUpdate(query),
);

platform.get(
  '/config',
  {
    summary: 'Get the remote configuration',
    description:
      'Every key has a value: the server’s where one is set and applies to this client, ' +
      'otherwise the default that is built into the clients. Unknown keys never appear.',
    auth: 'none',
    query: z.strictObject(clientQuery),
    response: z.strictObject({ values: configValuesSchema, fetchedAt: z.string() }),
  },
  ({ query }) => getClientConfig(query),
);

// --- Administration --------------------------------------------------------------------

const releaseSchema = z
  .strictObject({
    id: z.string(),
    appId: appIdSchema,
    platform: z.enum([RELEASE_PLATFORM_ANY, ...PLATFORMS]),
    channel: z.enum(RELEASE_CHANNELS),
    version: z.string(),
    minSupportedVersion: z.string().nullable(),
    mandatory: z.boolean(),
    notes: notesSchema,
    downloadUrl: z.string().nullable(),
    sha256: z.string().nullable(),
    sizeBytes: z.number().nullable(),
    rolloutPercent: z.number(),
    published: z.boolean(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .describe('Application release');

const releaseInput = {
  minSupportedVersion: versionSchema.nullable(),
  mandatory: z.boolean(),
  notes: notesSchema.partial(),
  // Only https: a client must never be sent to fetch an application over plain http.
  downloadUrl: z
    .url({ protocol: /^https$/ })
    .max(500)
    .nullable(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'v:invalid_format')
    .nullable(),
  sizeBytes: z.int().min(0).nullable(),
  rolloutPercent: z.int().min(0).max(100),
  published: z.boolean(),
};

const configEntrySchema = z.strictObject({
  key: z.enum(REMOTE_CONFIG_KEYS),
  defaultValue: z.unknown(),
  overridden: z.boolean().describe('Whether the server holds a value for the key'),
  value: z.unknown(),
  enabled: z.boolean(),
  rolloutPercent: z.number(),
  appIds: z.array(appIdSchema),
  description: z.string(),
  updatedAt: z.string().nullable(),
});

const admin = createModule({
  tag: 'Administration',
  description:
    'Managing releases and remote configuration. Requires the `admin` role, which is ' +
    'granted from the command line (`npm run admin:grant -- <email>`), never through the ' +
    'API. Every change is written to the security log of the administrator who made it.',
  basePath: '/admin',
});
const adminRoute = { auth: 'admin', errors: ['FORBIDDEN'] };

admin.get(
  '/releases',
  {
    ...adminRoute,
    summary: 'List releases, drafts included',
    query: z.strictObject({ appId: appIdSchema.optional() }),
    response: z.array(releaseSchema),
  },
  ({ query }) => listReleases(query),
);

admin.post(
  '/releases',
  {
    ...adminRoute,
    summary: 'Create a release',
    description: 'A release is a draft, offered to nobody, until it is published.',
    body: z.strictObject({
      appId: appIdSchema,
      platform: z.enum([RELEASE_PLATFORM_ANY, ...PLATFORMS]).default(RELEASE_PLATFORM_ANY),
      channel: z.enum(RELEASE_CHANNELS).default('stable'),
      version: versionSchema,
      minSupportedVersion: releaseInput.minSupportedVersion.default(null),
      mandatory: releaseInput.mandatory.default(false),
      notes: releaseInput.notes.default({}),
      downloadUrl: releaseInput.downloadUrl.default(null),
      sha256: releaseInput.sha256.default(null),
      sizeBytes: releaseInput.sizeBytes.default(null),
      rolloutPercent: releaseInput.rolloutPercent.default(100),
      published: releaseInput.published.default(false),
    }),
    response: releaseSchema,
    status: 201,
    errors: ['FORBIDDEN', 'CONFLICT'],
  },
  ({ auth, body, req }) => createRelease(auth, body, req?.client),
);

const releaseParams = z.strictObject({ releaseId: idSchema });

admin.patch(
  '/releases/:releaseId',
  {
    ...adminRoute,
    summary: 'Change a release, publish or withdraw it',
    description: 'The application, platform, channel and version of a release are fixed.',
    params: releaseParams,
    body: z.strictObject({
      minSupportedVersion: releaseInput.minSupportedVersion.optional(),
      mandatory: releaseInput.mandatory.optional(),
      notes: releaseInput.notes.optional(),
      downloadUrl: releaseInput.downloadUrl.optional(),
      sha256: releaseInput.sha256.optional(),
      sizeBytes: releaseInput.sizeBytes.optional(),
      rolloutPercent: releaseInput.rolloutPercent.optional(),
      published: releaseInput.published.optional(),
    }),
    response: releaseSchema,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
  },
  ({ auth, params, body, req }) => updateRelease(auth, params.releaseId, body, req?.client),
);

admin.delete(
  '/releases/:releaseId',
  {
    ...adminRoute,
    summary: 'Delete a release',
    params: releaseParams,
    status: 204,
    errors: ['FORBIDDEN', 'NOT_FOUND'],
  },
  async ({ auth, params, req }) => {
    await deleteRelease(auth, params.releaseId, req?.client);
  },
);

admin.get(
  '/config',
  {
    ...adminRoute,
    summary: 'List every configuration key with its stored value',
    response: z.array(configEntrySchema),
  },
  () => listConfig(),
);

const configParams = z.strictObject({ key: z.enum(REMOTE_CONFIG_KEYS) });

admin.put(
  '/config/:key',
  {
    ...adminRoute,
    summary: 'Set the value of a configuration key',
    description:
      'The value must have the shape of its key: `announcement` is null or ' +
      '`{ id, tone, message: { tr, en } }`; `registrationOpen` is a boolean.',
    params: configParams,
    body: z.strictObject({
      value: z.unknown(),
      enabled: z.boolean().default(true),
      rolloutPercent: z.int().min(0).max(100).default(100),
      appIds: z.array(appIdSchema).max(3).default([]),
      description: z.string().trim().max(300).default(''),
    }),
    response: configEntrySchema,
  },
  ({ auth, params, body, req }) => {
    const value = parseOrThrow(
      z.strictObject({ value: CONFIG_VALUE_SCHEMAS[params.key] }),
      { value: body.value },
      'body',
    ).value;
    return setConfig(auth, params.key, { ...body, value }, req?.client);
  },
);

admin.delete(
  '/config/:key',
  {
    ...adminRoute,
    summary: 'Return a configuration key to its default',
    params: configParams,
    response: configEntrySchema,
  },
  ({ auth, params, req }) => resetConfig(auth, params.key, req?.client),
);

export const platformRouter = platform.router;
export const adminRouter = admin.router;
