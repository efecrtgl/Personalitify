# Phase 12 — Event Infrastructure and Realtime

## Objective

Deliver every change of an account to every one of its devices while it happens — and make
sure that a device which was offline, or whose connection hiccuped, still ends up having
seen every change exactly once and in order.

## Implemented

### Event log over REST (API)

- `GET /events?after=<seq>&limit=<n>`: the user's events after a position, in order and
  without gaps, with `meta.headSeq` and `meta.hasMore`. The log itself has existed since
  Phase 2; this makes it readable by clients.

### Realtime (API)

- A Socket.IO server on the API's own port. A connection presents its **access token** in
  the handshake; the token and its session are verified exactly as for a REST call. A
  refused handshake names the reason (`UNAUTHENTICATED`, `TOKEN_EXPIRED`,
  `SESSION_REVOKED`).
- Every connection joins the rooms of its user, session and device. Each event of the
  account is pushed to all of the user's connections, in log order.
- `ready` (once per connection) tells the server's latest position; `replay` returns the
  events after a position, so a client can fetch what it missed over the same connection.
- **A connection lives no longer than its token**: at expiry the server says `auth:expired`
  and disconnects. **A revoked session loses its connections at once** (`auth:revoked`) —
  on sign-out, sign-out everywhere, device removal, and when the same device signs in again.
- Browsers are accepted only from the configured web origins.

### Realtime client (API client package)

- `EventSequencer`: delivers each event once and in order. Duplicates are dropped; an event
  that arrives early is held back until the gap before it has been filled by a replay; after
  a reconnect the missed events are fetched page by page; after a very long absence it asks
  for a reload instead. It is independent of sockets and of the browser.
- `createRealtime`: the Socket.IO connection around it — a fresh token for every
  (re)connection, reconnection after an expired token, no further attempts after a
  revocation, and status reporting.

### Live web client

- The application connects once the user is signed in and disconnects on sign-out.
- Each event refreshes the cached data it affects (a finished task: tasks, goals, calendar,
  dashboard, analytics, achievements), so whatever is on screen updates without a reload.
- A new notification that is not silent is announced as a toast, and the bell updates. The
  bell's polling drops from once a minute to a five-minute fallback.
- The journal entry that is open in the editor is not replaced while it is being written;
  a change made elsewhere is merged or reported when the writer saves.

## Architectural decisions

- **Realtime is a transport for the log, not a second source of truth.** Everything pushed
  can be read again by sequence number, so correctness never depends on a socket having
  delivered something. See [`docs/architecture/event-system.md`](../architecture/event-system.md).
- **Dense per-user sequence numbers** make a missing event detectable by arithmetic.
  Ordering and exactly-once delivery are then a small client-side rule, not a server
  guarantee that would be hard to keep.
- **The token, not the socket, carries authority.** Connections expire with their token and
  die with their session; there is no long-lived socket credential.
- **Invalidate, do not patch.** The web client maps an event to the queries it makes stale.
  It is less clever than patching caches from event payloads and much harder to get wrong.
- **Session revocation is announced after it is stored**, so a connection that was just
  closed cannot come straight back.
- **One process pushes.** Fan-out across several API processes needs a Socket.IO adapter;
  this is documented as a limit rather than half-built.

## Problems found and fixed during the phase

- **Remote changes would have replaced unsaved journal text.** With live updates, an edit
  of the same entry on another device refetched it and restarted the editor. Events about
  journal entries now refresh lists and tags only.
- **A token's expiry is whole seconds.** The first expiry test opened a connection 400 ms
  before the millisecond timestamp the API reports, which is already past the token's own
  (rounded-down) expiry. The server was right to refuse; the test now measures from the
  token's second.

## Important files

`apps/api/src/modules/events/{events.service,events.routes}.js`,
`apps/api/src/modules/realtime/realtime.server.js`,
`apps/api/src/modules/auth/session.service.js` (`onSessionsRevoked`),
`packages/api-client/src/{event-sequencer,realtime}.js`,
`apps/web/src/providers/RealtimeProvider.jsx`,
`docs/architecture/event-system.md`.

## Database changes

None. The existing `syncEvents` and `syncCounters` collections are read.

## API changes

1 new REST operation, `GET /events` (group Events), and the realtime protocol described in
`docs/architecture/event-system.md`. The verified access-token claims now include the
expiry. New dependencies: `socket.io` (API), `socket.io-client` (API client).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 284 passed (22 files) |
| `@personalitify/web`          | 128 passed (17 files) |
| `@personalitify/api-client`   | 22 passed (2 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (8), run against a real Socket.IO server with the real client package:
refused handshakes without a valid token; every change pushed in order to its own account
only, identical to the REST log; delivery to every device with the originating device named;
catching up after an absence from a stored position; **40 concurrent writes received as 40
consecutive sequence numbers** with nothing lost or repeated; replay requests, nonsense
input and paging of the REST log; connections closed on sign-out and sign-out everywhere,
with the old token refused; a connection ended at token expiry and refused afterwards.

New client tests (7): starting at the server's position; dropping duplicates; filling a gap
before delivering an early event; catching up page by page; events that arrive before the
start; asking for a reload after a long absence; reporting a failed catch-up and recovering.

New web tests (5): connecting once signed in with a current token; no connection for a
visitor; refreshing what a remote change affects and nothing else, and reloading after a
long absence; announcing a notification and updating the bell, silently for quiet hours;
closing the connection on sign-out.

Also passing: `npm run lint`, `npm run format:check`.

On the local Windows machine four API test workers crashed natively during the final run
and their files were rerun successfully (the known issue in
`docs/development/troubleshooting.md`); CI is the reference.

Manual verification, in a real browser against the development servers (WebSocket through
the Vite proxy) **without reloading the page**: a task finished from another session moved
the dashboard's figure from 5/7 to 6/7; a reminder produced by the live reminder job
appeared as a toast and raised the bell's count from 5 to 6. No console errors or warnings.

## Build results

`npm run build` succeeded: 1,467.5 kB JavaScript (434.8 kB gzip). The increase is the
Socket.IO client.

## Known limitations

- Push works within one API process; several processes need a Socket.IO adapter (the log
  and replay already work across processes).
- The event log is kept in full; retention and expired cursors are handled with
  synchronization in Phase 13.
- The web client refetches rather than applying event payloads, so a burst of remote
  changes causes a burst of requests (deduplicated per query while one is in flight).
- There is no visible connection indicator; the status is available to components
  (`useRealtimeStatus`) but not yet shown.
- Two tabs of the same browser are one device; both receive every event.

## Git

| Commit    | Message                                                               |
| --------- | --------------------------------------------------------------------- |
| `1d35f12` | feat(realtime): push the event log over Socket.IO                     |
| `4d6798c` | feat(api-client): add a realtime client with a gap-aware event reader |
| `be0fcec` | feat(web): update live from the account's events                      |
| `f43f8bc` | docs: document the event system and record phase 12                   |

Push status: pushed to `origin/main` and verified (`origin/main` = `f43f8bc`).
GitHub Actions: the CI workflow completed successfully for `f43f8bc` on Node 22 and Node 24.

## Next phase

Phase 13 — Synchronization engine.
