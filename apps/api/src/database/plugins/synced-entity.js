import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const pendingEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    entityVersion: { type: Number, required: true },
    occurredAt: { type: Date, required: true },
    deviceId: { type: String, default: null },
    opId: { type: String, default: null },
    changedFields: { type: [String], default: [] },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

/**
 * Adds the fields every synchronized, user-owned entity shares:
 *
 * - `_id`       UUID string, optionally supplied by the client.
 * - `userId`    Owner. Every query must be scoped by it.
 * - `version`   Monotonic entity version used for optimistic concurrency.
 * - `deletedAt` Tombstone. Deleted entities stay in the collection so the deletion can be
 *               synchronized to every device.
 * - `_outbox`   Events that were committed together with the entity but have not been moved
 *               to the event log yet (see ADR-004).
 */
export function syncedEntity(schema) {
  schema.add({
    _id: { type: String, default: randomUUID },
    userId: { type: String, required: true, immutable: true },
    version: { type: Number, required: true, default: 1, min: 1 },
    deletedAt: { type: Date, default: null },
    _outbox: { type: [pendingEventSchema], default: [], select: false },
  });

  schema.set('timestamps', true);
  schema.set('versionKey', false);
  schema.set('minimize', false);

  // Lets the outbox sweeper find documents with undelivered events without scanning.
  schema.index(
    { updatedAt: 1 },
    {
      name: 'pending_outbox',
      partialFilterExpression: { '_outbox.0': { $exists: true } },
    },
  );
  // Tombstone cleanup.
  schema.index(
    { deletedAt: 1 },
    { name: 'tombstones', partialFilterExpression: { deletedAt: { $type: 'date' } } },
  );
}
