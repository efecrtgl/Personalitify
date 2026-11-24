const randomId = () => globalThis.crypto.randomUUID();

/**
 * A local copy of an account, kept in step with the server — the reference implementation
 * of the synchronization protocol (docs/architecture/synchronization.md).
 *
 * It holds the entities in memory, which is enough for tests and small tools; a real client
 * replaces the three maps with its own storage and keeps the logic:
 *
 * - `bootstrap()`   a full copy: snapshot, then the changes since the snapshot began;
 * - `pull()`        the changes after the cursor, newest state per entity;
 * - `enqueue()`     an operation made while offline, with an id of its own;
 * - `flush()`       sends the queue; each operation is answered once, however often it is sent.
 *
 * @param {object} options
 * @param {object} options.sync       The `sync` namespace of the API client.
 * @param {() => string} [options.createId]  Makes operation ids; a UUID by default.
 */
export function createSyncReplica({ sync, createId = randomId }) {
  /** entityType → (id → entity) */
  const entities = new Map();
  let cursor = null;
  /** Operations not yet answered by the server, oldest first. */
  let queue = [];

  const table = (entityType) => {
    if (!entities.has(entityType)) entities.set(entityType, new Map());
    return entities.get(entityType);
  };

  /** Applies one change. A newer version wins; a deletion removes the entity. */
  function apply(change) {
    const rows = table(change.entityType);
    const current = rows.get(change.entityId);
    if (current && current.version > change.version) return;
    if (change.deleted) rows.delete(change.entityId);
    else rows.set(change.entityId, change.data);
  }

  async function bootstrap() {
    entities.clear();
    const manifest = await sync.snapshot();
    for (const { entityType } of manifest.types) {
      let after;
      do {
        const page = await sync.snapshotPage(entityType, { after });
        for (const item of page.items) table(entityType).set(item.id, item);
        after = page.next;
      } while (after);
    }
    // Whatever changed while the pages were being fetched is in the changes since then.
    cursor = manifest.cursor;
    return pull();
  }

  /** Brings the copy up to date. Starts over from a snapshot if the cursor has expired. */
  async function pull() {
    if (cursor === null) return bootstrap();
    let applied = 0;
    for (;;) {
      let answer;
      try {
        answer = await sync.changes({ cursor });
      } catch (error) {
        if (error?.code !== 'CURSOR_EXPIRED') throw error;
        cursor = null;
        return { ...(await bootstrap()), restarted: true };
      }
      for (const change of answer.changes) apply(change);
      applied += answer.changes.length;
      cursor = answer.cursor;
      if (!answer.hasMore) break;
    }
    await sync.ack(cursor);
    return { applied, cursor, restarted: false };
  }

  /** Queues an operation for the next `flush`. Returns its id. */
  function enqueue({ method, path, body }) {
    const operation = { opId: createId(), method, path, ...(body === undefined ? {} : { body }) };
    queue.push(operation);
    return operation.opId;
  }

  /**
   * Sends the queue in order. Operations the server answered — carried out or refused —
   * leave the queue; ones it could not answer stay for the next attempt, together with
   * everything queued behind them.
   * @returns {Promise<object[]>} The outcome of every operation that was answered.
   */
  async function flush({ batchSize = 100 } = {}) {
    const outcomes = [];
    while (queue.length > 0) {
      const batch = queue.slice(0, batchSize);
      const { results } = await sync.push(batch);
      const unanswered = results.findIndex(
        (result) =>
          result.status >= 500 || result.error?.details?.reason === 'operation_in_progress',
      );
      const answered = unanswered === -1 ? results : results.slice(0, unanswered);
      outcomes.push(...answered);
      queue = queue.slice(answered.length);
      // The server could not answer this one: stop, so that order is kept for the retry.
      if (unanswered !== -1) break;
    }
    return outcomes;
  }

  return {
    bootstrap,
    pull,
    enqueue,
    flush,
    getCursor: () => cursor,
    pending: () => queue.map((operation) => ({ ...operation })),
    get: (entityType, id) => table(entityType).get(id),
    all: (entityType) => [...table(entityType).values()],
    /** Stored state of a client that persists it; pass to `restore` after a restart. */
    dump: () => ({
      cursor,
      queue: queue.map((operation) => ({ ...operation })),
      entities: Object.fromEntries(
        [...entities].map(([entityType, rows]) => [entityType, [...rows.values()]]),
      ),
    }),
    restore(state) {
      entities.clear();
      for (const [entityType, rows] of Object.entries(state.entities ?? {})) {
        for (const item of rows) table(entityType).set(item.id, item);
      }
      cursor = state.cursor ?? null;
      queue = [...(state.queue ?? [])];
    },
  };
}
