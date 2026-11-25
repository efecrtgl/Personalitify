import { z } from 'zod';
import { createModule } from '../../core/routing.js';
import { idSchema } from '../../core/validation.js';
import { pushRateLimit } from '../../middleware/rate-limit.js';
import {
  MAX_CHANGES_PER_READ,
  MAX_OPERATIONS_PER_PUSH,
  MAX_SNAPSHOT_PAGE,
  acknowledge,
  getChanges,
  getSnapshotManifest,
  getSnapshotPage,
  getSyncStatus,
  push,
} from './sync.service.js';

const entity = z.record(z.string(), z.unknown());

const statusSchema = z.strictObject({
  headSeq: z.int().describe('The account’s latest position'),
  oldestCursor: z
    .int()
    .describe('Positions below this have left the history; catching up from them is not possible'),
  retentionDays: z.int(),
  device: z.strictObject({
    id: z.string(),
    cursor: z.int().describe('The last position this device confirmed'),
    lastSyncAt: z.string().nullable(),
    behind: z.int().describe('How many positions the device has not confirmed yet'),
    canCatchUp: z.boolean().describe('False: the device must start again from a snapshot'),
  }),
});

const sync = createModule({
  tag: 'Sync',
  description:
    'Keeps a device that stores its own copy of the data in step with the account. A device ' +
    'starts from a snapshot, then repeatedly pulls the changes after its cursor, pushes the ' +
    'operations it queued while offline, and confirms how far it has come. See ' +
    'docs/architecture/synchronization.md.',
  basePath: '/sync',
});

sync.get(
  '/status',
  { summary: 'Where the account and the calling device stand', response: statusSchema },
  ({ auth }) => getSyncStatus(auth),
);

sync.get(
  '/snapshot',
  {
    summary: 'Start a full copy',
    description:
      'Returns the cursor at which the copy starts and what there is to fetch. Fetch every ' +
      'type with `GET /sync/snapshot/{entityType}`, then pull the changes after `cursor`.',
    response: z.strictObject({
      cursor: z.int(),
      serverTime: z.string(),
      types: z.array(z.strictObject({ entityType: z.string(), count: z.int() })),
    }),
  },
  ({ auth }) => getSnapshotManifest(auth),
);

sync.get(
  '/snapshot/:entityType',
  {
    summary: 'One page of the entities of a type',
    description: 'Live entities only, ordered by id. Pass `next` as `after` for the next page.',
    params: z.strictObject({ entityType: z.string().min(1).max(40) }),
    query: z.strictObject({
      after: z.string().max(64).optional(),
      limit: z.coerce.number().int().min(1).max(MAX_SNAPSHOT_PAGE).default(MAX_SNAPSHOT_PAGE),
    }),
    response: z.strictObject({
      entityType: z.string(),
      items: z.array(entity),
      next: z.string().nullable(),
    }),
    errors: ['UNKNOWN_ENTITY_TYPE'],
  },
  ({ auth, params, query }) => getSnapshotPage(auth, params.entityType, query),
);

sync.get(
  '/changes',
  {
    summary: 'Pull what changed after a cursor',
    description:
      'The latest state of every entity that changed after `cursor`, deleted ones as ' +
      'tombstones, ordered by position. Send the returned `cursor` next time; while ' +
      '`hasMore` is true, ask again at once. Answers `CURSOR_EXPIRED` (410) when the ' +
      'cursor is older than the history that is kept: start again from a snapshot.',
    query: z.strictObject({
      cursor: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(MAX_CHANGES_PER_READ).default(500),
    }),
    response: z.strictObject({
      changes: z.array(
        z.strictObject({
          seq: z.int().describe('Position of the entity’s latest change'),
          entityType: z.string(),
          entityId: z.string(),
          version: z.int(),
          deleted: z.boolean(),
          changedAt: z.string(),
          data: entity.nullable().describe('The entity as it is now; null for a deletion'),
        }),
      ),
      cursor: z.int().describe('The position this answer reaches'),
      headSeq: z.int(),
      hasMore: z.boolean(),
    }),
    errors: ['CURSOR_EXPIRED'],
  },
  ({ auth, query }) => getChanges(auth, query),
);

sync.post(
  '/ack',
  {
    summary: 'Confirm how far the device has applied the changes',
    description: 'A device’s position never moves back; a lower value is ignored.',
    body: z.strictObject({ cursor: z.int().min(0) }),
    response: statusSchema,
  },
  ({ auth, body }) => acknowledge(auth, body),
);

const outcomeError = z.strictObject({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

sync.post(
  '/push',
  {
    summary: 'Carry out queued operations',
    middleware: [pushRateLimit],
    description:
      'Each operation is a request the client would have made while online: a method, a ' +
      'path below the API prefix and a body, with an id (`opId`) the client chose. ' +
      'Operations are carried out in order, each exactly like that request, and each gets ' +
      'its own outcome — one failing does not stop the next. Sending an operation again ' +
      'with the same `opId` returns its first outcome (`replayed: true`) without doing ' +
      'anything twice. Sign-in, account, device and synchronization operations cannot be ' +
      `pushed. At most ${MAX_OPERATIONS_PER_PUSH} operations per request, and 30 requests a minute.`,
    body: z.strictObject({
      operations: z
        .array(
          z.strictObject({
            opId: idSchema.describe('Chosen by the client; unique per operation'),
            method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
            path: z
              .string()
              .min(2)
              .max(300)
              .regex(/^\/[^?#\s]*$/, 'v:invalid_format')
              .describe('For example `/tasks` or `/tasks/{id}/complete`'),
            body: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .min(1)
        .max(MAX_OPERATIONS_PER_PUSH)
        .refine(
          (operations) => new Set(operations.map((item) => item.opId)).size === operations.length,
          {
            message: 'v:duplicate_value',
          },
        ),
    }),
    response: z.strictObject({
      results: z.array(
        z.strictObject({
          opId: z.string(),
          status: z.int().describe('The HTTP status the request would have been answered with'),
          ok: z.boolean(),
          replayed: z.boolean().describe('True: carried out before; this is the stored outcome'),
          data: z.unknown().optional(),
          error: outcomeError.optional(),
        }),
      ),
      cursor: z.int().describe('The account’s position after the operations'),
    }),
  },
  ({ auth, body, language }) => push(auth, body, language),
);

export const syncRouter = sync.router;
