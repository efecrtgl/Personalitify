# Rust client compatibility

What a native client written in Rust needs in order to be a full citizen of a Personalitify
account, and where each piece is specified. The desktop client itself is **not part of this
repository and has not been written**; this document is the contract it will be built
against.

Nothing in the backend is specific to JavaScript or to the web client. The web client uses
exactly the API described here — through `packages/api-client`, which doubles as a readable
reference implementation of every protocol below.

The Rust snippets are **sketches to show the shape of things. They are not compiled or
tested as part of this repository**; the JSON they describe is, by the tests named at the
end.

## Sources of truth

| What                   | Where                                                                  | Kept honest by                                           |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Every endpoint         | [`docs/api/openapi.json`](../api/openapi.json) (OpenAPI 3.0)           | generated from the routes; a test fails when it drifts   |
| Every entity's shape   | [`docs/api/schemas/`](../api/schemas/index.json) (JSON Schema 2020-12) | generated from the schemas responses are checked against |
| Conventions            | [`docs/api/overview.md`](../api/overview.md)                           | —                                                        |
| Events and realtime    | [`event-system.md`](./event-system.md)                                 | realtime tests with the real client                      |
| Synchronization        | [`synchronization.md`](./synchronization.md)                           | multi-device tests with the reference replica            |
| Timer                  | [`focus-timer.md`](./focus-timer.md)                                   | —                                                        |
| Updates and config     | [`updates-and-configuration.md`](./updates-and-configuration.md)       | —                                                        |
| Time zones, recurrence | [`time-and-recurrence.md`](./time-and-recurrence.md)                   | —                                                        |

Types can be generated from the JSON Schemas (for example with `typify` or `quicktype`) or
written by hand with `serde`; the OpenAPI document can drive a generated HTTP client
(`progenitor`, `openapi-generator`). Hand-written is entirely reasonable: the surface is
regular.

## Wire conventions

- **Base path** `/api/v1`. JSON in and out, UTF-8.
- **Success**: `{ "data": …, "meta": … }` (`meta` only where documented, e.g. pagination).
  `204` has no body.
- **Failure**: `{ "error": { "code", "message", "details"?, "requestId" } }`. Branch on
  `code` (a closed list: `ERROR_CODES` in `packages/shared-contracts/src/errors.js`, and
  `error.schema.json`); show `message`, which is already in the language asked for.
- **Headers**: `Authorization: Bearer <access token>`, `Accept-Language: tr|en`, optionally
  `X-Request-Id` (8–64 characters of `[A-Za-z0-9_-]`; echoed back).
- **Unknown fields are rejected** in requests (`400 VALIDATION_FAILED`); do not send fields
  the schema does not list. In responses, ignore fields you do not know
  (`#[serde(default)]`, no `deny_unknown_fields`) so that additions do not break you.

```rust
#[derive(serde::Deserialize)]
struct Envelope<T, M = serde::de::IgnoredAny> {
    data: T,
    meta: Option<M>,
}

#[derive(serde::Deserialize)]
struct ApiErrorBody {
    error: ApiError,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiError {
    code: String, // match on this
    message: String,
    #[serde(default)]
    details: Option<serde_json::Value>,
    request_id: String,
}
```

### Data formats

| Data                  | On the wire                              | Suggested Rust type                              |
| --------------------- | ---------------------------------------- | ------------------------------------------------ |
| Identifier            | UUID string                              | `uuid::Uuid`                                     |
| Instant               | ISO 8601 UTC, `2026-11-24T09:00:00.000Z` | `chrono::DateTime<Utc>` / `time::OffsetDateTime` |
| Calendar date         | `YYYY-MM-DD`, **no zone**                | `chrono::NaiveDate`                              |
| Time of day           | `HH:mm`, **no zone**                     | `chrono::NaiveTime` (custom format)              |
| Time zone             | IANA name, `Europe/Istanbul`             | `chrono_tz::Tz`                                  |
| Entity version, `seq` | integer                                  | `u64`                                            |
| Color                 | `#rrggbb`                                | `String`                                         |
| Enumerations          | lower-case strings                       | `enum` with `#[serde(rename_all = …)]`           |

Calendar dates and times of day are the user's own wall clock and must never be converted
through UTC: "the habit is due on 2026-11-24" is true in every time zone. **The server
decides what "today" is** — from the time zone in the user's settings — and says so in its
answers (`today`). A client should use that rather than the device's date, which may be in
another zone.

All JSON keys are camelCase: `#[serde(rename_all = "camelCase")]` on every struct.

## Identity and sessions

Full description: [`docs/api/overview.md`](../api/overview.md#authentication).

1. Generate an **installation id** (UUID) once and keep it. Send it in `device` with every
   registration and sign-in, with `clientType: "desktop"`, the `platform`
   (`windows`/`macos`/`linux`), `appId: "personalitify-desktop"` and the app version.
2. `POST /auth/register` or `POST /auth/login` answers `{ tokens, user, profile, settings }`.
   For a native client `tokens.refreshToken` is in the body (browsers get a cookie instead).
3. Keep the **refresh token in the operating system's credential store** (Windows
   Credential Manager, macOS Keychain, Secret Service — the `keyring` crate covers all
   three). Keep the access token in memory only.
4. The access token lives 15 minutes. Refresh a little before `accessTokenExpiresAt`, or on
   `401 TOKEN_EXPIRED`, with `POST /auth/refresh { "refreshToken": … }`.
5. **Refresh tokens are single-use.** Every refresh returns a new one; store it before using
   the new access token. Presenting an old one closes the session
   (`REFRESH_TOKEN_REUSED`) — so make sure only one refresh runs at a time (a mutex around
   it), and that two processes of the application do not share a token without coordination.
6. `SESSION_REVOKED`, `INVALID_REFRESH_TOKEN` and `REFRESH_TOKEN_REUSED` end the session:
   forget the tokens and ask the user to sign in.

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tokens {
    access_token: String,
    access_token_expires_at: chrono::DateTime<chrono::Utc>,
    refresh_token: Option<String>, // Some(..) for native clients
    refresh_token_expires_at: chrono::DateTime<chrono::Utc>,
    session_id: uuid::Uuid,
    device_id: uuid::Uuid, // the server's id for this installation
}
```

Rate limits: 300 requests a minute in general, 10 a minute for sign-in and registration, 60
a minute for refresh; `429 RATE_LIMITED` comes with `Retry-After`.

## The data model

Thirteen entity types make up an account (`docs/api/schemas/index.json`): `profile`,
`settings`, `category`, `habit`, `habitEntry`, `goal`, `task`, `calendarEvent`,
`focusSession`, `journalEntry`, `moodEntry`, `achievement`, `notification`.

Every one of them has `id`, `version`, `createdAt`, `updatedAt`, and **the same shape
wherever it appears**: in the answer of its endpoints, in a snapshot, in a change, in an
event. One Rust type per entity is enough.

```rust
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: uuid::Uuid,
    version: u64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    title: String,
    status: TaskStatus,               // todo | in_progress | done | cancelled
    priority: TaskPriority,           // none | low | medium | high
    due_date: Option<chrono::NaiveDate>,
    due_time: Option<String>,         // "HH:mm"
    // … the rest as in entities/task.schema.json
}
```

Things worth knowing before modelling:

- **Ids may be chosen by the client.** `POST` endpoints accept an optional `id`. Use it for
  everything created offline, so the record keeps its identity when it reaches the server.
- **Some records are made only by the server**: `achievement`, `notification`, and the
  per-day XP. A client reads them and never creates them.
- **Derived figures are not stored fields.** Streaks, goal percentages, "today", analytics
  and the dashboard are computed by the server from the user's time zone; ask for them
  rather than re-deriving them, or accept that your offline copy shows them as of the last
  answer.
- **Recurring events are one record; recurring tasks are many.** See
  [`time-and-recurrence.md`](./time-and-recurrence.md) before drawing a calendar.

## Writing

- A partial update is `PATCH` with only the fields that change, plus **`baseVersion`** — the
  version the change was based on. Different fields changed elsewhere are merged; the same
  field changed elsewhere answers `409 VERSION_CONFLICT` with
  `details.{ currentVersion, conflictingFields, current }`. Show the user both and retry on
  top of `current.version`.
- Leaving `baseVersion` out means "last writer wins". A client with an offline copy should
  always send it.
- Deleting needs no version and wins over concurrent edits.

## Staying in step

Two mechanisms, for two situations, built on the same event log:

**While running — realtime.** [`event-system.md`](./event-system.md). Socket.IO v4 on the
API's port (`rust_socketio` speaks it; `tokio-tungstenite` plus the Engine.IO framing also
works). Authenticate with `auth: { token }`, listen for `ready`, `event`, `auth:expired`
and `auth:revoked`, and ask `replay` for what was missed. The rule that makes it lossless is
six lines long and is implemented in
[`packages/api-client/src/event-sequencer.js`](../../packages/api-client/src/event-sequencer.js):
apply `seq == cursor + 1`, drop `seq <= cursor`, hold back anything later and fetch the gap.

A client that would rather not hold a socket can poll `GET /events?after=<cursor>`; it
returns the same events.

**After being away — synchronization.** [`synchronization.md`](./synchronization.md).
Snapshot → pull → push → ack, with one number of state (the cursor) and a queue of
operations. The reference is
[`packages/api-client/src/sync-replica.js`](../../packages/api-client/src/sync-replica.js),
about 150 lines, written to be ported:

```rust
// What a local store has to do; everything else is HTTP.
trait Replica {
    fn cursor(&self) -> Option<u64>;
    fn set_cursor(&mut self, cursor: u64);
    /// Keep the newer version; remove on `deleted`.
    fn apply(&mut self, change: Change);
    fn clear(&mut self);
    /// Operations made offline, oldest first: { opId, method, path, body }.
    fn queue(&mut self) -> &mut Vec<Operation>;
}
```

The loop: on start, `pull` (or `snapshot` when there is no cursor, or after
`410 CURSOR_EXPIRED`). When online: **push the queue, then pull, then ack**. While offline:
apply the change to the local copy and queue the request you would have made, with a fresh
`opId` (UUID). Sending an operation twice is safe; its outcome is remembered for 30 days.

Storage is the client's choice; SQLite (`rusqlite`/`sqlx`) with one table per entity type,
or a single table keyed by `(entity_type, id)` holding the JSON, both fit the protocol.

## The timer

[`focus-timer.md`](./focus-timer.md). The session is a server record and the server owns
the clock: draw the countdown from `endsAt` and the difference between `serverTime` and the
device clock, never from a local stopwatch. Follow `focusSession.*` events to show a timer
that was started on the phone.

## Updates and remote configuration

[`updates-and-configuration.md`](./updates-and-configuration.md). Before sign-in and
periodically: `GET /updates/check` (with the installation id, so gradual rollouts are
stable) and `GET /config`. The check returns a download address and a SHA-256;
**downloading, verifying the checksum and installing are the client's job** — for a Tauri
application its updater plugin, otherwise the platform's installer. If `supported` is false,
stop and ask for the update. Configuration keys have built-in defaults; ship them, and
treat the endpoint as an override.

## Notifications

`notification` entities carry a `kind` and `params`, not text. Phrase them in the client
(the sentences the web client uses are in
`packages/localization/locales/*/notifications.json`) and raise a system notification when
a `notification.created` event arrives with `silent: false`. Marking one as read is
`POST /notifications/{id}/read`, and reaches the user's other devices as an event.

## Localization

The server speaks Turkish and English for the messages it produces (errors, e-mails) and
follows `Accept-Language`. Everything else — labels, notification sentences, achievement
names — is client-side. The web client's catalogs are plain JSON under
`packages/localization/locales/{tr,en}` and can be loaded as they are (for example with
`fluent` after conversion, or `rust-i18n`). Turkish is the default language of the product.

## Suggested crates

Suggestions, not requirements; none is used in this repository.

| Need               | Crate                                      |
| ------------------ | ------------------------------------------ |
| HTTP               | `reqwest` (with `rustls`)                  |
| JSON               | `serde`, `serde_json`                      |
| Async runtime      | `tokio`                                    |
| Realtime           | `rust_socketio` or `tokio-tungstenite`     |
| Ids, time          | `uuid`, `chrono` + `chrono-tz` (or `time`) |
| Credential storage | `keyring`                                  |
| Local database     | `rusqlite` or `sqlx` (SQLite)              |
| Shell              | `tauri`, or any native UI toolkit          |

## Checklist for a first working client

1. Installation id generated and stored; device descriptor sent on sign-in.
2. Sign-in, refresh with rotation under a mutex, refresh token in the credential store.
3. Envelope and error handling; `Accept-Language`.
4. Entity types from the JSON Schemas; tolerant of unknown response fields.
5. Snapshot into local storage; pull by cursor; `CURSOR_EXPIRED` → snapshot again.
6. Offline queue with `opId`; push before pull; conflicts shown to the user.
7. Realtime with the sequencer; `auth:expired` → refresh and reconnect; `auth:revoked` →
   sign out.
8. Ack the cursor; show "up to date".
9. Update check and configuration on start and periodically; honour `supported: false`.
10. System notifications from `notification.created`.

## What proves the contract

Run with `npm test`; each of these exercises the API the way a native client would:

| Test (`apps/api/tests`)                      | Proves                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contracts.test.js`                          | sign-in without cookies, refresh rotation, sign-out; real data of **every entity type**, and the `data` of every event, validate against the published schemas; live follow and offline catch-up |
| `sync.test.js`                               | snapshot, pull, push, idempotency, merges, conflicts, tombstones, expired cursors                                                                                                                |
| `realtime.test.js`                           | handshake, ordering, replay, bursts, expiry, revocation                                                                                                                                          |
| `openapi.test.js`                            | the API reference matches the routes                                                                                                                                                             |
| `packages/api-client/tests/coverage.test.js` | the JavaScript client reaches every operation of the API                                                                                                                                         |
