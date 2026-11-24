import { EVENT_SCHEMA_VERSION, parseEventName } from '@personalitify/shared-contracts';
import { logger } from '../../core/logger.js';
import { dispatch } from './event-bus.js';
import { SyncCounter, SyncEvent } from './sync-event.model.js';

/** Models whose documents carry an outbox. Filled by the entity service. */
const outboxModels = new Set();

export function registerOutboxModel(model) {
  outboxModels.add(model);
}

/** Serializes relay work per user so sequence numbers follow commit order within a process. */
const userQueues = new Map();

function enqueue(userId, task) {
  const previous = userQueues.get(userId) ?? Promise.resolve();
  const next = previous.then(task, task);
  userQueues.set(userId, next);
  next.finally(() => {
    if (userQueues.get(userId) === next) userQueues.delete(userId);
  });
  return next;
}

/** Public shape of an event, as delivered to clients and subscribers. */
export function toPublicEvent(record) {
  return {
    eventId: record._id,
    event: record.type,
    schemaVersion: record.schemaVersion,
    seq: record.seq,
    userId: record.userId,
    entityType: record.entityType,
    entityId: record.entityId,
    entityVersion: record.entityVersion,
    timestamp: record.occurredAt.toISOString(),
    originDeviceId: record.deviceId ?? null,
    opId: record.opId ?? null,
    changedFields: record.changedFields ?? [],
    data: record.data,
  };
}

async function relayDocument(model, documentId) {
  const document = await model.findById(documentId).select('+_outbox userId').lean();
  if (!document || !document._outbox?.length) {
    return [];
  }

  const relayed = [];
  const published = [];

  for (const pending of document._outbox) {
    const alreadyLogged = await SyncEvent.findById(pending.eventId).lean();
    if (alreadyLogged) {
      // A previous attempt stored the event but stopped before clearing the outbox.
      relayed.push(pending.eventId);
      continue;
    }

    const counter = await SyncCounter.findOneAndUpdate(
      { _id: document.userId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    ).lean();

    try {
      const [record] = await SyncEvent.create([
        {
          _id: pending.eventId,
          userId: document.userId,
          seq: counter.seq,
          type: pending.type,
          entityType: parseEventName(pending.type).entityType,
          entityId: String(document._id),
          entityVersion: pending.entityVersion,
          schemaVersion: EVENT_SCHEMA_VERSION,
          occurredAt: pending.occurredAt,
          deviceId: pending.deviceId,
          opId: pending.opId,
          changedFields: pending.changedFields,
          data: pending.data,
        },
      ]);
      published.push(toPublicEvent(record));
    } catch (error) {
      if (error?.code !== 11000) throw error;
      // Another relay attempt won the race for this event; its copy is the one that counts.
    }
    relayed.push(pending.eventId);
  }

  await model.updateOne(
    { _id: documentId },
    { $pull: { _outbox: { eventId: { $in: relayed } } } },
    { timestamps: false },
  );

  return published;
}

/**
 * Moves the pending events of one entity into the event log and notifies subscribers.
 * Safe to call repeatedly and concurrently; an event is logged exactly once.
 */
export async function flushOutbox(model, documentId, userId) {
  const published = await enqueue(userId, () => relayDocument(model, documentId));
  // Subscribers run after the relay has left the per-user queue: a subscriber may itself
  // write an entity of the same user, and that write needs the queue to log its own event.
  for (const event of published) {
    await dispatch(event);
  }
  return published;
}

/**
 * Called after a write. A failure here is not an error for the caller: the event is safely
 * stored in the entity's outbox and the sweeper will deliver it.
 */
export async function flushOutboxSafely(model, documentId, userId) {
  try {
    return await flushOutbox(model, documentId, userId);
  } catch (error) {
    logger.warn(
      { err: error, entityId: documentId },
      'Outbox relay failed; the sweeper will retry',
    );
    return [];
  }
}

/**
 * Delivers events left behind by a crash or a failed relay.
 * Only documents untouched for `minAgeMs` are considered, so it does not race with requests.
 */
export async function sweepOutboxes({ minAgeMs = 2000, batchSize = 200 } = {}) {
  const olderThan = new Date(Date.now() - minAgeMs);
  let delivered = 0;

  for (const model of outboxModels) {
    const stale = await model
      .find({ '_outbox.0': { $exists: true }, updatedAt: { $lte: olderThan } })
      .select('_id userId')
      .limit(batchSize)
      .lean();

    for (const document of stale) {
      try {
        const published = await flushOutbox(model, document._id, document.userId);
        delivered += published.length;
      } catch (error) {
        logger.error({ err: error, entityId: document._id }, 'Outbox sweep failed for entity');
      }
    }
  }
  return delivered;
}

let sweeperTimer = null;

export function startOutboxSweeper({ intervalMs = 5000 } = {}) {
  if (sweeperTimer) return;
  sweeperTimer = setInterval(() => {
    sweepOutboxes().catch((error) => logger.error({ err: error }, 'Outbox sweep failed'));
  }, intervalMs);
  sweeperTimer.unref();
}

export function stopOutboxSweeper() {
  clearInterval(sweeperTimer);
  sweeperTimer = null;
}
