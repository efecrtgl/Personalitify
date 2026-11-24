import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { logger } from './logger.js';

/**
 * Background jobs that run inside the API process.
 *
 * There is no queue server: a job is a function that is called on an interval. What makes
 * that safe when several API processes run against one database is a lock per job in
 * MongoDB — a process runs a job only if it can take the lock, and the lock expires by
 * itself if the process dies. Jobs must be idempotent: after a crash the same work is
 * attempted again.
 */
const jobLockSchema = new mongoose.Schema(
  {
    _id: { type: String }, // job name
    owner: { type: String, default: null },
    lockedUntil: { type: Date, default: null },
    lastStartedAt: { type: Date, default: null },
    lastFinishedAt: { type: Date, default: null },
    lastDurationMs: { type: Number, default: null },
    lastError: { type: String, default: null },
  },
  { collection: 'jobLocks', versionKey: false },
);

export const JobLock = mongoose.model('JobLock', jobLockSchema);

const processId = randomUUID();
const jobs = new Map();
const timers = new Map();

/**
 * @param {object} job
 * @param {string} job.name
 * @param {number} job.intervalMs    How often the job is attempted.
 * @param {number} [job.lockMs]      How long a run may take before another process may
 *                                   take over. Defaults to five intervals, at least a minute.
 * @param {(context: { now: Date, previousRunAt: Date | null }) => Promise<unknown>} job.run
 */
export function defineJob({ name, intervalMs, lockMs, run }) {
  jobs.set(name, { name, intervalMs, lockMs: lockMs ?? Math.max(60_000, intervalMs * 5), run });
}

export const listJobs = () => [...jobs.keys()];

/** Takes the job's lock for this process, or returns null when another process holds it. */
async function acquire(job, now) {
  const until = new Date(now.getTime() + job.lockMs);
  try {
    return await JobLock.findOneAndUpdate(
      { _id: job.name, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { $set: { owner: processId, lockedUntil: until, lastStartedAt: now } },
      // The document before the update: its `lastStartedAt` is the previous run.
      { upsert: true, returnDocument: 'before' },
    ).then((before) => ({ previousRunAt: before?.lastStartedAt ?? null }));
  } catch (error) {
    // The upsert lost a race for a lock that is held: the unique `_id` rejects it.
    if (error?.code === 11000) return null;
    throw error;
  }
}

/**
 * Runs a job once if its lock is free.
 * @returns {Promise<{ ran: boolean, result?: unknown, error?: Error }>}
 */
export async function runJob(name, { now = new Date() } = {}) {
  const job = jobs.get(name);
  if (!job) throw new Error(`Unknown job: ${name}`);
  const lock = await acquire(job, now);
  if (!lock) return { ran: false };

  const started = Date.now();
  let outcome;
  try {
    outcome = { ran: true, result: await job.run({ now, previousRunAt: lock.previousRunAt }) };
  } catch (error) {
    logger.error({ err: error, job: name }, 'Background job failed');
    outcome = { ran: true, error };
  }
  await JobLock.updateOne(
    { _id: name, owner: processId },
    {
      $set: {
        lockedUntil: null,
        lastFinishedAt: new Date(),
        lastDurationMs: Date.now() - started,
        lastError: outcome.error ? String(outcome.error.message).slice(0, 500) : null,
      },
    },
  );
  return outcome;
}

/** Starts every defined job on its interval. Timers do not keep the process alive. */
export function startJobs() {
  for (const job of jobs.values()) {
    if (timers.has(job.name)) continue;
    const timer = setInterval(() => {
      runJob(job.name).catch((error) =>
        logger.error({ err: error, job: job.name }, 'Background job could not be started'),
      );
    }, job.intervalMs);
    timer.unref();
    timers.set(job.name, timer);
  }
  logger.info({ jobs: listJobs() }, 'Background jobs started');
}

export function stopJobs() {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}
