import mongoose from 'mongoose';

/**
 * The durable, per-user ordered event log. A client's synchronization cursor is the highest
 * `seq` it has applied.
 */
const syncEventSchema = new mongoose.Schema(
  {
    _id: { type: String }, // eventId
    userId: { type: String, required: true },
    seq: { type: Number, required: true },
    type: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    entityVersion: { type: Number, required: true },
    schemaVersion: { type: Number, required: true },
    occurredAt: { type: Date, required: true },
    deviceId: { type: String, default: null },
    opId: { type: String, default: null },
    changedFields: { type: [String], default: [] },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  {
    collection: 'syncEvents',
    versionKey: false,
    minimize: false,
    timestamps: { createdAt: true, updatedAt: false },
  },
);

syncEventSchema.index({ userId: 1, seq: 1 }, { unique: true });
syncEventSchema.index({ userId: 1, entityType: 1, entityId: 1, entityVersion: 1 });
syncEventSchema.index({ userId: 1, occurredAt: -1 });
syncEventSchema.index({ createdAt: 1 });

export const SyncEvent = mongoose.model('SyncEvent', syncEventSchema);

/** One document per user holding the last assigned sequence number. */
const syncCounterSchema = new mongoose.Schema(
  {
    _id: { type: String }, // userId
    seq: { type: Number, required: true, default: 0 },
    // Events up to this number have been removed by retention. A reader whose position is
    // lower cannot catch up from the log and starts again from a snapshot.
    prunedThrough: { type: Number, default: 0 },
  },
  { collection: 'syncCounters', versionKey: false },
);

export const SyncCounter = mongoose.model('SyncCounter', syncCounterSchema);
