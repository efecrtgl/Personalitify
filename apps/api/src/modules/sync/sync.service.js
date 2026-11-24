import { ERROR_CODES } from '@personalitify/shared-contracts';
import { getConfig } from '../../config/env.js';
import { getEntityService, listEntityTypes } from '../../core/entity/entity-service.js';
import { AppError, fieldError } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { matchRoute } from '../../core/routing.js';
import { registerUserCollection } from '../../core/user-data.js';
import { describeError } from '../../middleware/error-handler.js';
import { Device } from '../devices/device.model.js';
import { SyncCounter, SyncEvent } from '../events/sync-event.model.js';
import { SyncOperation } from './sync-operation.model.js';

registerUserCollection({ key: 'syncOperations', model: SyncOperation });

export const MAX_CHANGES_PER_READ = 1000;
export const MAX_SNAPSHOT_PAGE = 500;
export const MAX_OPERATIONS_PER_PUSH = 100;

/** An operation that has been running this long is taken to have died with its process. */
const STALE_OPERATION_MS = 60_000;
/**
 * Operations that are not data changes and must be made as requests of their own: they set
 * cookies, need the current password, or concern the synchronization itself.
 */
const NOT_PUSHABLE = ['/auth', '/account', '/sync', '/devices'];
const PUSHABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function positions(userId) {
  const counter = await SyncCounter.findById(userId).lean();
  return { headSeq: counter?.seq ?? 0, prunedThrough: counter?.prunedThrough ?? 0 };
}

const cursorExpired = (details) => new AppError(410, ERROR_CODES.CURSOR_EXPIRED, { details });

function entityServiceOf(entityType) {
  const service = getEntityService(entityType);
  if (!service) {
    throw new AppError(422, ERROR_CODES.UNKNOWN_ENTITY_TYPE, { details: { entityType } });
  }
  return service;
}

// --- Snapshot --------------------------------------------------------------------------

/**
 * Where a full copy starts: the position of the log right now and what there is to fetch.
 * The client fetches every type page by page and then asks for the changes after `cursor`;
 * whatever changed while it was fetching is in those changes.
 */
export async function getSnapshotManifest(auth) {
  const { headSeq } = await positions(auth.userId);
  const types = await Promise.all(
    listEntityTypes().map(async (entityType) => ({
      entityType,
      count: await getEntityService(entityType).model.countDocuments({
        userId: auth.userId,
        deletedAt: null,
      }),
    })),
  );
  return { cursor: headSeq, serverTime: new Date().toISOString(), types };
}

/** One page of the live entities of a type, ordered by id. */
export async function getSnapshotPage(auth, entityType, { after, limit = MAX_SNAPSHOT_PAGE }) {
  const service = entityServiceOf(entityType);
  const filter = { userId: auth.userId, deletedAt: null };
  if (after) filter._id = { $gt: after };
  const documents = await service.model
    .find(filter)
    .sort({ _id: 1 })
    .limit(limit + 1);
  const page = documents.slice(0, limit);
  return {
    entityType,
    items: page.map((document) => service.serialize(document)),
    // Pass as `after` to get the next page; null when this was the last one.
    next: documents.length > limit ? String(page.at(-1)._id) : null,
  };
}

// --- Changes ---------------------------------------------------------------------------

/**
 * What changed after `cursor`, as the latest state of each entity that changed.
 *
 * Unlike the raw event log, an entity that changed five times appears once, with its newest
 * version — a client that was away wants the result, not the history. Deleted entities
 * appear as tombstones. The answer is ordered by position and ends with the cursor to send
 * next; `hasMore` tells the client to ask again at once.
 */
export async function getChanges(auth, { cursor = 0, limit = 500 }) {
  const { headSeq, prunedThrough } = await positions(auth.userId);
  if (cursor < prunedThrough) {
    throw cursorExpired({ cursor, oldestCursor: prunedThrough, headSeq });
  }
  // A position the log has never reached belongs to another life of the account.
  if (cursor > headSeq) throw cursorExpired({ cursor, oldestCursor: prunedThrough, headSeq });

  const records = await SyncEvent.find({ userId: auth.userId, seq: { $gt: cursor } })
    .sort({ seq: 1 })
    .limit(limit + 1)
    .lean();
  const read = records.slice(0, limit);

  const latest = new Map();
  for (const record of read) {
    latest.set(`${record.entityType}:${record.entityId}`, record);
  }
  const changes = [...latest.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((record) => {
      const deleted = record.type.endsWith('.deleted');
      return {
        seq: record.seq,
        entityType: record.entityType,
        entityId: record.entityId,
        version: record.entityVersion,
        deleted,
        changedAt: record.occurredAt.toISOString(),
        // The entity as it is now; for a deletion only its tombstone.
        data: deleted ? null : record.data,
      };
    });

  return {
    changes,
    cursor: read.at(-1)?.seq ?? cursor,
    headSeq,
    hasMore: records.length > limit,
  };
}

// --- Device positions ------------------------------------------------------------------

/** Records how far the calling device has applied the log. A position never moves back. */
export async function acknowledge(auth, { cursor }) {
  const { headSeq } = await positions(auth.userId);
  if (cursor > headSeq) throw fieldError('cursor', 'too_big_number', { maximum: headSeq });
  await Device.updateOne(
    { _id: auth.deviceId, userId: auth.userId },
    { $max: { syncCursor: cursor }, $set: { lastSyncAt: new Date() } },
  );
  return getSyncStatus(auth);
}

export async function getSyncStatus(auth) {
  const [{ headSeq, prunedThrough }, device] = await Promise.all([
    positions(auth.userId),
    Device.findOne({ _id: auth.deviceId, userId: auth.userId }).lean(),
  ]);
  const cursor = device?.syncCursor ?? 0;
  return {
    headSeq,
    oldestCursor: prunedThrough,
    retentionDays: getConfig().sync.retentionDays,
    device: {
      id: auth.deviceId,
      cursor,
      lastSyncAt: device?.lastSyncAt ? device.lastSyncAt.toISOString() : null,
      behind: Math.max(0, headSeq - cursor),
      // False when the device has been away for longer than the history is kept.
      canCatchUp: cursor >= prunedThrough,
    },
  };
}

// --- Push ------------------------------------------------------------------------------

/**
 * Reserves an operation id. Tells whether the operation is to be carried out now, has been
 * carried out before (with what outcome), or is being carried out by another request.
 */
async function claim(auth, { opId, method, path }) {
  const now = new Date();
  try {
    await SyncOperation.create({
      userId: auth.userId,
      opId,
      deviceId: auth.deviceId ?? null,
      method,
      path,
      startedAt: now,
    });
    return { run: true };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const existing = await SyncOperation.findOne({ userId: auth.userId, opId }).lean();
  if (!existing) return claim(auth, { opId, method, path }); // Expired in between.
  if (existing.method !== method || existing.path !== path) {
    return { mismatch: true };
  }
  if (existing.state === 'done') return { previous: existing };
  if (now.getTime() - existing.startedAt.getTime() < STALE_OPERATION_MS) return { busy: true };

  // The request that started it never finished. Take it over; the entity-level rules
  // (client-supplied ids, base versions) keep a second attempt from doing damage.
  const taken = await SyncOperation.updateOne(
    { _id: existing._id, state: 'running', startedAt: existing.startedAt },
    { $set: { startedAt: now } },
  );
  return taken.modifiedCount === 1 ? { run: true } : { busy: true };
}

const failure = (opId, status, code, message, details) => ({
  opId,
  status,
  ok: false,
  replayed: false,
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

async function carryOut(auth, language, operation) {
  const { opId, body } = operation;
  const method = operation.method.toUpperCase();
  const { path } = operation;
  const refuse = (status, code, details) =>
    failure(
      opId,
      status,
      code,
      describeError(new AppError(status, code), language).error.message,
      details,
    );

  if (!PUSHABLE_METHODS.has(method)) {
    return refuse(400, ERROR_CODES.VALIDATION_FAILED, { reason: 'method_not_pushable' });
  }
  const found = matchRoute(method, path);
  if (!found) return refuse(404, ERROR_CODES.ROUTE_NOT_FOUND);
  if (found.route.auth !== 'user' || NOT_PUSHABLE.some((prefix) => path.startsWith(prefix))) {
    return refuse(403, ERROR_CODES.FORBIDDEN, { reason: 'not_pushable' });
  }

  const claimed = await claim(auth, { opId, method, path });
  if (claimed.mismatch) {
    return refuse(409, ERROR_CODES.CONFLICT, { reason: 'operation_id_reused' });
  }
  if (claimed.busy) return refuse(409, ERROR_CODES.CONFLICT, { reason: 'operation_in_progress' });
  if (claimed.previous) {
    return { opId, replayed: true, ...claimed.previous.outcome };
  }

  let outcome;
  try {
    const answer = await found.route.execute({
      // The operation id travels with the caller, so the events it causes carry it too.
      auth: { ...auth, opId },
      language,
      params: found.params,
      body,
    });
    outcome = {
      status: answer.status,
      ok: true,
      ...(answer.data === undefined ? {} : { data: answer.data }),
    };
  } catch (error) {
    const described = describeError(error, language);
    if (!described.known) {
      // Nothing is known about what happened: forget the attempt so that it can be retried.
      logger.error({ err: error, opId, method, path }, 'Pushed operation failed unexpectedly');
      await SyncOperation.deleteOne({ userId: auth.userId, opId });
      return { opId, replayed: false, status: 500, ok: false, error: described.error };
    }
    outcome = { status: described.status, ok: false, error: described.error };
  }

  await SyncOperation.updateOne(
    { userId: auth.userId, opId },
    { $set: { state: 'done', finishedAt: new Date(), status: outcome.status, outcome } },
  );
  return { opId, replayed: false, ...outcome };
}

/**
 * Carries out operations a client queued while it could not reach the server.
 *
 * Each operation is a request the client would have made — a method, a path and a body —
 * with an id of its own. They are carried out one after another, each exactly like the
 * request it stands for: same validation, same rules, same events. One failing does not
 * stop the ones after it; each gets its own outcome. Sending the same batch again returns
 * the same outcomes without doing anything twice.
 */
export async function push(auth, { operations }, language) {
  const results = [];
  for (const operation of operations) {
    results.push(await carryOut(auth, language, operation));
  }
  const { headSeq } = await positions(auth.userId);
  return { results, cursor: headSeq };
}

// --- Retention -------------------------------------------------------------------------

/**
 * Removes history that is older than the retention: events, and the tombstones of entities
 * deleted before then. Devices that were away for longer start again from a snapshot.
 */
export async function pruneHistory(now = new Date()) {
  const cutoff = new Date(now.getTime() - getConfig().sync.retentionDays * 86_400_000);

  const perUser = await SyncEvent.aggregate([
    { $match: { createdAt: { $lt: cutoff } } },
    { $group: { _id: '$userId', through: { $max: '$seq' } } },
  ]);
  let events = 0;
  for (const { _id: userId, through } of perUser) {
    // The floor is raised first: a reader is told its position expired before the events
    // are gone, never the other way round.
    await SyncCounter.updateOne({ _id: userId }, { $max: { prunedThrough: through } });
    const { deletedCount } = await SyncEvent.deleteMany({ userId, seq: { $lte: through } });
    events += deletedCount;
  }

  let tombstones = 0;
  for (const entityType of listEntityTypes()) {
    const { deletedCount } = await getEntityService(entityType).model.deleteMany({
      deletedAt: { $lt: cutoff },
    });
    tombstones += deletedCount;
  }
  return { events, tombstones };
}
