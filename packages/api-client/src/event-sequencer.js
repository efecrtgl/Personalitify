/**
 * Puts a user's events in order, exactly once each, whatever the connection does.
 *
 * Every event carries `seq`, its position in the user's event log; positions are dense. The
 * sequencer keeps a cursor — the last position it has delivered — and:
 *
 * - delivers an event that is next in line,
 * - drops one it has delivered already (a duplicate after a reconnect),
 * - holds back one that arrives early and asks for the missing ones (`fetchAfter`), so a
 *   gap is always filled before anything behind it is delivered.
 *
 * It knows nothing about sockets: `fetchAfter(seq)` is any function that returns
 * `{ events, headSeq, hasMore }`, over the realtime connection or over `GET /events`.
 */
export class EventSequencer {
  /**
   * @param {object} options
   * @param {(event: object) => void} options.onEvent       Called once per event, in order.
   * @param {(after: number) => Promise<{ events: object[], headSeq: number, hasMore: boolean }>} options.fetchAfter
   * @param {() => void} [options.onReset]  Called when too much was missed to replay: the
   *                                        client should reload its data instead.
   * @param {(error: unknown) => void} [options.onError]
   * @param {number} [options.cursor]       Where a client that persists its position resumes.
   * @param {number} [options.maxReplay]    Missed events beyond this are not replayed.
   */
  constructor({ onEvent, fetchAfter, onReset, onError, cursor = null, maxReplay = 2000 }) {
    this.onEvent = onEvent;
    this.fetchAfter = fetchAfter;
    this.onReset = onReset;
    this.onError = onError;
    this.cursor = cursor;
    this.maxReplay = maxReplay;
    this.pending = new Map();
    this.catchingUp = null;
  }

  /**
   * Called when the connection is (re)established and the server has told its latest
   * position. A client without a position starts from there; one that fell behind catches up.
   */
  async start(headSeq) {
    if (this.cursor === null) {
      this.cursor = headSeq;
      this.#drain();
      return;
    }
    if (headSeq - this.cursor > this.maxReplay) {
      this.cursor = headSeq;
      this.pending.clear();
      this.onReset?.();
      return;
    }
    if (headSeq > this.cursor) await this.catchUp();
  }

  /** Takes an event from the connection. */
  push(event) {
    if (this.cursor !== null && event.seq <= this.cursor) return;
    this.pending.set(event.seq, event);
    if (this.cursor === null) return; // Not started yet: kept until `start`.
    this.#drain();
    if (this.pending.size > 0) {
      // Something before this event is missing.
      this.catchUp().catch(() => {});
    }
  }

  /** Fetches and delivers everything after the cursor. Concurrent calls share one run. */
  catchUp() {
    this.catchingUp ??= this.#fetchMissing().finally(() => {
      this.catchingUp = null;
    });
    return this.catchingUp;
  }

  async #fetchMissing() {
    try {
      let hasMore = true;
      while (hasMore) {
        const page = await this.fetchAfter(this.cursor);
        for (const event of page.events) this.#deliver(event);
        hasMore = page.hasMore && page.events.length > 0;
      }
      this.#drain();
    } catch (error) {
      this.onError?.(error);
      throw error;
    }
  }

  #deliver(event) {
    if (event.seq !== this.cursor + 1) return;
    this.cursor = event.seq;
    this.pending.delete(event.seq);
    this.onEvent(event);
  }

  /** Delivers held-back events for as long as the next one in line is there. */
  #drain() {
    for (const seq of [...this.pending.keys()]) {
      if (seq <= this.cursor) this.pending.delete(seq);
    }
    while (this.pending.has(this.cursor + 1)) {
      this.#deliver(this.pending.get(this.cursor + 1));
    }
  }
}
