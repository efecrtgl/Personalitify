# Phase 13 — Synchronization Engine

## Objective

Give a device that keeps its own copy of the data — the planned desktop client, or any
client that must work offline — everything it needs to stay in step with the account: a way
to get a full copy, to catch up, to send what it did while away, and to resolve the cases
where two devices changed the same thing.

## Implemented

### Synchronization API

- **Snapshot.** `GET /sync/snapshot` fixes the cursor at which a full copy starts and lists
  what there is to fetch; `GET /sync/snapshot/{entityType}` returns the live entities of a
  type page by page. No lock is needed: changes made while pages are fetched are in the
  change feed after that cursor.
- **Pull.** `GET /sync/changes?cursor=` returns the **newest state of each entity** that
  changed after the cursor — an entity that changed five times appears once — with deleted
  entities as tombstones, ordered by position, in pages.
- **Push.** `POST /sync/push` carries out up to 100 queued operations. An operation is the
  request the device would have made online (`method`, `path`, `body`) with an id of its
  own. Each is carried out **through the same route** as that request — same validation,
  rules and events — in order, with an outcome of its own. Every data operation of the API
  can be queued, including non-CRUD ones (completing a task, recording a habit day, adding a
  milestone, starting a timer).
- **Exactly once per operation id.** Outcomes are remembered for 30 days; a repeated
  operation returns its first outcome (`replayed: true`) without being carried out again.
  An id used for a different operation is refused.
- **Device positions.** `POST /sync/ack` records how far a device has come (never
  backwards); `GET /sync/status` reports the account's position, the device's, how far
  behind it is and whether it can still catch up.
- **Retention.** A job removes events and tombstones older than `SYNC_RETENTION_DAYS`
  (default 90) and records the position below which the log is gone. A device behind it is
  answered `410 CURSOR_EXPIRED` and starts again from a snapshot. Sequence numbers are never
  reused.
- Operations that are not data changes cannot be pushed (sign-in and sign-out, account,
  devices, synchronization itself).

### Conflict handling (as seen through sync)

- Offline edits of **different fields** of the same record merge (via `baseVersion`).
- Edits of the **same field** are refused with `VERSION_CONFLICT` and the current entity, so
  the device can let the user decide.
- **Deletion wins** over a later edit (`NOT_FOUND`); the copy is removed on the next pull.
- Client-chosen ids make offline creates free of conflicts.

### Reference client

- `createSyncReplica` in the API client: `bootstrap`, `pull` (restarting from a snapshot on
  an expired cursor), `enqueue`, `flush` (keeping order when the server cannot answer) and
  `dump`/`restore`. It is what the multi-device tests run against a real server, and it is
  written to be read and ported to the desktop client.
- `api.sync.*` methods for the six endpoints.

### Web

- The web client confirms its position periodically, and **Settings → Devices** shows for
  each device whether it is up to date, how many changes it is behind, or that it has not
  synchronized yet.

## Architectural decisions

- **Push replays requests instead of defining a second write API.** The route registry that
  already generates the OpenAPI document can now also execute a route without HTTP. One
  implementation of each operation, reachable two ways; nothing to keep in step. See
  [`docs/architecture/synchronization.md`](../architecture/synchronization.md).
- **The change feed is compacted, the event log is not.** Realtime clients want every event
  in order; a device that was away wants the result. Both read the same log.
- **A device's state is one number.** Cursors, not per-entity sync flags.
- **Conflicts are surfaced, never silently resolved** for the same field. Merging different
  fields is safe; choosing between two people's words is not the server's job.
- **Expired cursors restart from a snapshot** rather than keeping tombstones for ever.
- **No transactions.** Each operation commits on its own (standalone MongoDB, ADR-002); a
  batch can be half applied, and every outcome says what happened to its operation.

## Problems found and fixed during the phase

- **The API test helper never shared its server.** It handed a server to the HTTP test
  library before the server had an address; the library then started and closed a listener
  of its own for every request, on a new port each time. Every earlier test passed anyway;
  the first client that connected to the "shared" address (the sync tests) found nothing
  there. The server is now listening before the first test runs.
- **Routes that write their own response** (downloads) had to be told apart when route
  execution was separated from HTTP; they are skipped by the response check as before.

## Important files

`apps/api/src/modules/sync/{sync.service,sync.routes,sync.jobs,sync-operation.model}.js`,
`apps/api/src/core/routing.js` (`matchRoute`, executable routes),
`apps/api/src/middleware/error-handler.js` (`describeError`),
`packages/api-client/src/sync-replica.js`,
`apps/web/src/pages/settings/DevicesSection.jsx`,
`docs/architecture/synchronization.md`.

## Database changes

New collection `syncOperations` (outcomes by operation id, expiring after 30 days);
`syncCounters` gains `prunedThrough`. The `syncCursor` and `lastSyncAt` fields of `devices`,
present since Phase 2, are now written. New setting `SYNC_RETENTION_DAYS`.

## API changes

6 new operations in the group Sync. See [`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 294 passed (23 files) |
| `@personalitify/web`          | 130 passed (17 files) |
| `@personalitify/api-client`   | 27 passed (3 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (10), each device being the real API client with the reference replica,
talking to a real server:

- a full copy from a snapshot, page by page, equal to what the API lists;
- pulling the newest state with tombstones, in steps, and confirming the position;
- **two devices converging** through online changes, an offline queue and a deletion, with
  the origin device and operation id on the resulting events;
- an operation carried out once however often its batch is sent, and the misuse cases;
- **merging offline edits of different fields, a same-field conflict, an edit of a deleted
  record**, and the queue continuing past refusals;
- every data operation of the API accepted through push, and nothing else;
- a long absence pulled in steps;
- **retention**: history and tombstones removed, an expired cursor reported, the replica
  restarting from a snapshot by itself, and the log continuing with the next number;
- a replica's state, queue included, surviving a restart without doubling anything;
- isolation between accounts.

New client tests (5): copying and then applying what changed meanwhile; never replacing a
newer version; restarting on an expired cursor; keeping queue order when the server cannot
answer; batching and restart.

New web tests (2): the sync state of each device; confirming the position periodically, once
per position.

Also passing: `npm run lint`, `npm run format:check`.

On the local Windows machine the native test-worker crashes (documented in
`docs/development/troubleshooting.md`) were frequent in this phase: in six consecutive runs
of the whole API suite between one and four files were cut short by a crashed worker, never
by a failed assertion. Every one of the 23 API test files was therefore also run on its own
until it completed: 294 tests passed, none failed. CI is the reference.

## Build results

`npm run build` succeeded: 1,468.8 kB JavaScript (435.3 kB gzip).

## Known limitations

- If the server process dies in the middle of a pushed operation, the retry carries it out
  again. Client-chosen ids and base versions make that harmless; an operation with neither
  (for example starting a timer) could then happen twice.
- A pushed batch is not atomic.
- The web client is online-first: it does not keep an offline copy or queue. The replica is
  a reference for clients that do.
- The snapshot of a very large account is many requests (500 entities per page); there is
  no single archive download for bootstrapping.
- Outcomes are remembered for 30 days; a retry later than that is carried out again.

## Git

| Commit    | Message                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `355fcca` | test(api): share one listening server per test file for real              |
| `99720d1` | refactor(api): make declared routes executable without an HTTP request    |
| `16dfb6a` | feat(sync): add snapshot, change feed, device cursors and idempotent push |
| `e9a9d81` | feat(api-client): add the sync namespace and a reference replica          |
| `51f7b47` | feat(web): confirm the device's position and show sync state per device   |
| `ea9fbf8` | docs: document synchronization and record phase 13                        |

Push status: pushed to `origin/main` and verified (`origin/main` = `ea9fbf8`).
GitHub Actions: the CI workflow completed successfully for `ea9fbf8` on Node 22 and Node 24.

## Next phase

Phase 14 — Application updates and remote configuration.
