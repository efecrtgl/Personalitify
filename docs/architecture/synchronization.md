# Synchronization

How a device that keeps its own copy of the data — a desktop or mobile client that must
work offline — stays in step with the account. Code: `apps/api/src/modules/sync`; the
reference client: `packages/api-client/src/sync-replica.js`. Endpoints: `/api/v1/sync…`
(group Sync in the OpenAPI document).

The web client does not need most of this: it is online-first and follows the account
through the realtime connection ([event-system.md](./event-system.md)). Synchronization is
the same machinery seen from a device that can be away for a week.

## The building blocks

Everything rests on four properties that were built in earlier phases:

| Property                                    | Gives                                               |
| ------------------------------------------- | --------------------------------------------------- |
| Every entity has a monotonic `version`      | "which copy is newer" is a comparison of numbers    |
| Deleting leaves a tombstone (`deletedAt`)   | a deletion can be told to devices that were away    |
| Every change is an event with a dense `seq` | "what did I miss" is "everything after my position" |
| Clients may choose entity ids (UUIDs)       | a record made offline keeps its id when it arrives  |

A device's whole synchronization state is **one number**: its cursor, the `seq` up to which
it has applied the account's changes.

## The four moves

### 1. Snapshot — getting a full copy

```
GET /sync/snapshot                → { cursor, types: [{ entityType, count }] }
GET /sync/snapshot/{entityType}   → { items, next }      (repeat with ?after=next)
```

The first call fixes the cursor at which the copy starts. The device then fetches every type
page by page (ordered by id, 500 per page) and finally pulls the changes after that cursor.
Whatever changed while the pages were being fetched is in those changes, so the copy needs
no lock and no consistent read: versions sort it out.

### 2. Pull — catching up

```
GET /sync/changes?cursor=<seq>    → { changes, cursor, headSeq, hasMore }
```

Each change is **the latest state of one entity** that changed after the cursor:

```json
{
  "seq": 4182,
  "entityType": "task",
  "entityId": "…",
  "version": 7,
  "deleted": false,
  "changedAt": "…",
  "data": { "…": "the entity as it is now" }
}
```

An entity that changed five times appears once — a device that was away wants the result,
not the history. A deleted entity appears with `deleted: true` and no data. The device
applies a change if its version is not older than what it has, stores the returned cursor,
and asks again while `hasMore` is true.

**Applying a change is idempotent** (same version, same result), so a device may safely
re-pull from an older cursor after a crash.

### 3. Push — sending what was done offline

```
POST /sync/push   { operations: [{ opId, method, path, body }] }
                → { results: [{ opId, status, ok, replayed, data | error }], cursor }
```

An operation is **the request the device would have made had it been online** — for example
`{ "method": "POST", "path": "/tasks/<id>/complete" }` — plus an id the device chose. The
server carries each one out through the very same route: same validation, same business
rules, same events. There is no second, parallel write API to keep in step with the first;
every data operation of the REST API can be queued, including the ones that are not simple
field updates (completing a recurring task, recording a habit day, adding a milestone).

- Operations run **in order**, and each gets **its own outcome**. One being refused does not
  stop the ones behind it.
- **Idempotent by `opId`.** The outcome of an operation is remembered for 30 days. A device
  that never heard the answer sends the same batch again and gets the same outcomes with
  `replayed: true`; nothing is done twice. Using an id for a different operation is refused.
- Operations that are not data changes cannot be pushed: sign-in and sign-out, account
  deletion, device management, and synchronization itself.
- At most 100 operations per request.

### 4. Ack — saying how far one has come

```
POST /sync/ack   { cursor }       → status
GET  /sync/status                 → { headSeq, oldestCursor, retentionDays, device: { cursor, behind, canCatchUp } }
```

The device confirms its cursor now and then. The server keeps it per device (it never moves
back), which is what lets the account's device list say "up to date" or "23 changes behind".

## Conflicts

Two devices changing the same record while apart is the normal case, not an error case.

- **Different fields merge.** An update carries `baseVersion`, the version it was based on.
  If the entity has moved on but the fields this update touches were not changed in between,
  the update is applied on top. The phone raising a task's priority and the desktop renaming
  it both win.
- **The same field conflicts.** The update is refused with `409 VERSION_CONFLICT` and
  `details`: the conflicting fields, the current version and the current entity. The device
  decides — usually by showing the user both — and sends a new update based on the current
  version. The server never silently overwrites one person's edit with another's.
- **Deletion wins.** An update to something that was deleted elsewhere is answered
  `404 NOT_FOUND`; the device removes its copy when it pulls the tombstone.
- **Creates do not conflict**, because ids are chosen by the client. Creating the same id
  twice is answered `409 ID_ALREADY_EXISTS`, which a device can treat as "already there".
- An update without `baseVersion` is applied as it is — last writer wins — for clients that
  are always online.

## Being away for a long time

The history is kept for `SYNC_RETENTION_DAYS` (90 by default). A background job removes
events and tombstones older than that and records, per account, the position below which
the log is gone.

A device whose cursor is older than that is answered **`410 CURSOR_EXPIRED`** when it pulls.
It cannot know what was deleted in the meantime, so it does the only correct thing: it
starts again from a snapshot. Its queued operations are unaffected — they are pushed as
usual, and the ones that no longer apply come back as conflicts or not-found.

Sequence numbers are never reused: after history has been removed the log simply continues
with the next number.

## The recommended loop

```
on start:      cursor known?  → pull   (on CURSOR_EXPIRED → snapshot)
               otherwise      → snapshot
when online:   push the queue → pull → ack
               then follow the realtime connection; on a gap or reconnect → pull
when offline:  apply the change locally, queue the operation with a new opId
```

Order matters in one place: **push before pull**. The device's own operations then arrive
back as part of the pulled changes, in their final server form (versions, computed fields),
and replace the local guesses.

`createSyncReplica` in the API client implements exactly this — `bootstrap`, `pull`,
`enqueue`, `flush`, and `dump`/`restore` for a client that persists its state — in about
150 lines, and is what the multi-device tests run against a real server. It is meant to be
read and ported.

## Guarantees and their limits

- A device that follows the loop converges to the server's state: tested with two devices
  editing online and offline, with merges, conflicts, deletions, lost answers, restarts and
  an expired cursor.
- An operation is carried out at most once per `opId` — with one stated exception: if the
  server process dies in the middle of an operation, the retry carries it out again. Records
  created with client-chosen ids and updates with `baseVersion` make that harmless; an
  operation without either (for example "start a focus session") could then happen twice.
- Operations of one batch are not a transaction. MongoDB runs standalone here (ADR-002), so
  each operation commits on its own; a batch can be half applied, and each outcome says so.
- The outcome store and the device cursors are per account; nothing is shared between users.
