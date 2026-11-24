import { toPublicEvent } from './outbox-relay.js';
import { SyncCounter, SyncEvent } from './sync-event.model.js';

/** How many events one request may read. */
export const MAX_EVENTS_PER_READ = 500;

/** The sequence number of the user's latest event; 0 when there is none yet. */
export async function getHeadSeq(userId) {
  const counter = await SyncCounter.findById(userId).lean();
  return counter?.seq ?? 0;
}

/**
 * The user's events after `after`, in order.
 *
 * Sequence numbers are dense per user: an answer never skips one. `hasMore` tells the reader
 * to ask again from the last event it received.
 */
export async function readEvents(userId, { after = 0, limit = 200 } = {}) {
  const size = Math.min(limit, MAX_EVENTS_PER_READ);
  const [records, headSeq] = await Promise.all([
    SyncEvent.find({ userId, seq: { $gt: after } })
      .sort({ seq: 1 })
      .limit(size + 1)
      .lean(),
    getHeadSeq(userId),
  ]);
  const hasMore = records.length > size;
  const events = records.slice(0, size).map(toPublicEvent);
  return { events, headSeq, hasMore };
}
