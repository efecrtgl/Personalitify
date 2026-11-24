import mongoose from 'mongoose';

/** Outcomes are remembered this long; a retry after that is carried out again. */
const REMEMBER_DAYS = 30;

/**
 * The record of an operation a client sent with an operation id.
 *
 * A client that does not know whether its request arrived sends it again with the same
 * `opId`; the stored outcome is returned and nothing is done twice.
 */
const syncOperationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, immutable: true },
    opId: { type: String, required: true, immutable: true },
    deviceId: { type: String, default: null },
    method: { type: String, required: true },
    path: { type: String, required: true },
    state: { type: String, enum: ['running', 'done'], default: 'running' },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    // What the operation was answered with: HTTP status and either data or an error.
    status: { type: Number, default: null },
    outcome: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { collection: 'syncOperations', versionKey: false, minimize: false },
);

syncOperationSchema.index({ userId: 1, opId: 1 }, { unique: true });
syncOperationSchema.index({ startedAt: 1 }, { expireAfterSeconds: REMEMBER_DAYS * 86_400 });

export const SyncOperation = mongoose.model('SyncOperation', syncOperationSchema);
