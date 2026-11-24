# Event system and realtime

How a change becomes an event, how events reach other modules and other devices, and what a
client must do to never miss one. Code: `apps/api/src/modules/events`,
`apps/api/src/modules/realtime`, `packages/api-client/src/{event-sequencer,realtime}.js`.

## From a write to an event

Every synchronized entity (habit, task, goal, journal entry, notification, …) is written
through the entity service. One write does three things **in a single document update**:

1. changes the entity and raises its `version`;
2. appends the event that describes the change to the entity's own `_outbox` array.

Because both are in the same document, MongoDB commits them together even on a standalone
server without transactions: there is no moment at which the change exists and its event
does not (ADR-004, the embedded outbox).

3. Right after the write, the **relay** moves the pending events into the user's event log
   (`syncEvents`), giving each the next number from the user's counter. If the process dies
   between 1 and 3, a sweeper finds the outbox later and relays it; relaying is idempotent
   by event id.

## The event log

```json
{
  "eventId": "9d1f…",
  "event": "task.updated",
  "schemaVersion": 1,
  "seq": 4182,
  "userId": "…",
  "entityType": "task",
  "entityId": "…",
  "entityVersion": 7,
  "timestamp": "2026-11-24T09:00:00.000Z",
  "originDeviceId": "…",
  "opId": null,
  "changedFields": ["status", "completedAt", "completedOn"],
  "data": { "…": "the entity after the change" }
}
```

- `event` is `<entityType>.<created|updated|deleted>`. The entity types are listed in
  `packages/shared-contracts/src/events.js`.
- **`seq` is dense per user**: 1, 2, 3, … with no gaps. A reader that holds `seq` 41 and
  receives 43 knows that exactly one event is missing. This is the property everything else
  rests on.
- `data` is the whole entity after the change, in the same shape as the REST API returns it;
  for a deletion it is `{ id, version, deletedAt }`.
- `originDeviceId` is the device whose request caused the change (`null` when the server
  itself did, for example a reminder). A client can use it to recognise its own echo.
- `schemaVersion` changes only for a breaking change of this envelope.

`GET /api/v1/events?after=<seq>&limit=<n>` returns the events after a position, in order,
with `meta.headSeq` (the user's latest position) and `meta.hasMore`.

## Inside the server: subscribers

After an event is in the log it is handed to in-process subscribers (`event-bus.js`). This
is how modules react to each other without calling each other:

| Subscriber        | Reacts to                               | Does                                  |
| ----------------- | --------------------------------------- | ------------------------------------- |
| reference cleanup | `<entity>.deleted`                      | detaches the deleted record elsewhere |
| achievements      | habit, task, goal, focus, journal, mood | reconciles XP, unlocks achievements   |
| notifications     | `achievement.created`, focus sessions   | tells the user                        |
| realtime          | everything                              | pushes the event to connected clients |

Delivery is **at least once** — after a crash an event can be handed over again — so every
subscriber is idempotent. A failing subscriber is logged and affects neither the request
nor the other subscribers.

## Realtime

The realtime connection (Socket.IO, same port as the API, default path `/socket.io`) pushes
the event log to the user's connected devices. It adds no data of its own: everything it
sends can also be read from `GET /events`.

### Connecting

The client passes its access token in the handshake (`auth: { token }`). The server checks
the token **and** that its session is still active, then puts the connection in the rooms of
its user, session and device. A refused handshake carries the reason in `error.data.code`:
`UNAUTHENTICATED`, `TOKEN_EXPIRED` or `SESSION_REVOKED`.

Browsers are accepted only from the configured web origins; native clients send no `Origin`.

### Messages

| Direction | Message        | Payload                                                              |
| --------- | -------------- | -------------------------------------------------------------------- |
| → client  | `ready`        | `{ userId, deviceId, headSeq, serverTime }`, once per connection     |
| → client  | `event`        | one event, as above                                                  |
| → client  | `auth:expired` | none — the access token ran out; reconnect with a fresh one          |
| → client  | `auth:revoked` | none — the session was closed; the user must sign in again           |
| → server  | `replay`       | `{ after, limit }` → acknowledged `{ ok, events, headSeq, hasMore }` |

- A connection lives **no longer than the token it was opened with**. At expiry the server
  says `auth:expired` and disconnects; the client refreshes its token over REST and
  reconnects. No connection outlives a revoked credential by more than the token lifetime.
- Signing out, signing out everywhere, removing a device, or signing in again on the same
  device **closes the affected connections at once** with `auth:revoked`.

### Never missing an event

A socket can drop a message, deliver one twice after a reconnect, or — across reconnects —
out of order. The client-side rule (`EventSequencer`) is short:

1. Keep a **cursor**: the `seq` of the last event applied.
2. An event with `seq === cursor + 1` is applied; the cursor moves.
3. An event with `seq <= cursor` is a duplicate and is dropped.
4. An event with `seq > cursor + 1` is held back, and the missing ones are fetched with
   `replay` (or `GET /events`) from the cursor. Only then is it applied.
5. On `ready`: a client without a cursor starts at `headSeq`; a client whose cursor is
   behind `headSeq` fetches what it missed, page by page.
6. A client that missed more than it wants to replay (2,000 events by default) reloads its
   data instead and continues from `headSeq`.

With these rules the order of delivery to the application is exactly the order of the log,
each event once — tested with dropped connections, bursts of concurrent writes and
duplicates.

### What the web client does with events

It does not patch its cache event by event: one finished task changes the task list, the
dashboard, the analytics and the XP. Instead each entity type maps to the cached queries it
makes stale, and those are refetched; whatever is on screen updates at once. A new
notification that is not silent is also shown as a toast. The journal entry open in the
editor is deliberately not replaced under the writer's hands; a change from elsewhere is
merged or reported when they save.

## Limits, stated plainly

- **One API process.** Events are pushed by the process that handled the write. Running
  several API processes behind a load balancer needs a Socket.IO adapter (or sticky sessions
  plus a shared bus) so that a write in one process reaches sockets held by another. The
  event log and `replay` already work across processes; only the push does not.
- The log is kept in full for now. Retention, and what a client does when its cursor is
  older than the log (`CURSOR_EXPIRED`), are part of the synchronization phase.
- Events are per user. There are no shared or public channels.

## For the desktop client

Nothing here is specific to JavaScript: a Rust client needs a Socket.IO v4 client (or plain
`GET /events` polling), the token handshake, the five messages above and the six rules of
the sequencer. `packages/api-client/src/event-sequencer.js` is 120 lines and can be ported
as it is.
