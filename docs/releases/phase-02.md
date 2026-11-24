# Phase 2 — Backend Core and Security

## Objective

Build the backend foundation every later module stands on: request handling, validation,
security, authentication, device sessions, and the write path that turns every change into a
versioned, synchronizable event.

## Implemented

### Core

- **Route declarations with schemas** (`core/routing.js`). One declaration provides input
  validation, authentication, the response envelope and the OpenAPI entry. Outside production
  each response is checked against its documented schema.
- **Centralized error handling** with stable error codes (`packages/shared-contracts`) and
  messages localized in Turkish and English from `Accept-Language`.
- **Validation** with zod: strict objects (unknown fields are rejected), localized per-field
  messages, reusable schemas for ids, dates, times, time zones and pagination.
- **Security middleware**: Helmet with a deny-all content policy, CORS allowlist with
  credentials, rate limiting (general and credential endpoints), a guard that rejects
  MongoDB operator keys anywhere in a body or query, JSON-only request bodies, 1 MB limit.
- **Structured logging** per request with request ids; secrets are redacted.
- **OpenAPI 3.0** generated from the registered routes, served at `/api/v1/openapi.json`,
  browsable at `/api/v1/docs`, committed as `docs/api/openapi.json`.

### Authentication and accounts

- Registration, sign-in, sign-out, sign-out everywhere.
- scrypt password hashing (N=2¹⁵, r=8, p=3) with stored parameters and rehash on login.
- 15-minute JWT access tokens; opaque refresh tokens stored as SHA-256 hashes, rotated on
  every use, with reuse detection that closes the session and a 10-second grace window for
  racing duplicates.
- Sessions are verified on every request, so revocation is immediate.
- Refresh token delivery by `HttpOnly; SameSite=Strict` cookie for browser clients and in the
  response body for native clients, through the same endpoints.
- Device registration per installation, device list, rename, removal (signs the device out).
- Email verification and password reset with hashed, single-use, expiring tokens. Without
  SMTP settings the email (with its link) is written to the API log.
- Password change (keeps the current session, ends the others).
- Profile and settings as synchronized entities.
- Account data export and permanent account deletion, both driven by a registry of every
  collection that holds personal data.
- Security audit log with 180-day retention and a paginated endpoint.

### Versioned entities and events

- `createEntityService` — the single write path for synchronized entities: ownership
  scoping, version increments, no-op detection, optimistic concurrency, field-level merge of
  stale updates, `409 VERSION_CONFLICT` with the current resource, soft-delete tombstones.
- **Atomic outbox**: entity change and event in one single-document write; an idempotent
  relay moves events to `syncEvents` with a dense per-user sequence number; a sweeper
  recovers events stranded by a crash.
- In-process event bus with at-least-once delivery to isolated subscribers.

## Architectural decisions

- No MongoDB transactions anywhere (ADR-004); verified by tests on a standalone server.
- Access tokens carry a `jti`, so two tokens issued in the same second differ. Found by a
  test that compared a refreshed token with its predecessor.
- One live session per device: signing in again from the same installation replaces the
  earlier session.
- Password-reset tokens are validated before they are consumed, so a rejected new password
  does not burn the link.

## Important files

`apps/api/src/core/{routing,validation,errors,openapi,crypto,user-data}.js`,
`core/entity/entity-service.js`, `database/plugins/synced-entity.js`,
`middleware/{authenticate,security,rate-limit,error-handler,request-context}.js`,
`modules/{auth,users,settings,devices,account,audit,events,docs}/`, `services/mailer.js`,
`packages/shared-contracts/src/{errors,events,preferences}.js`,
`packages/localization/locales/*/{errors,emails}.json`.

## Database changes

New collections: `users`, `profiles`, `userSettings`, `devices`, `sessions`, `authTokens`,
`auditLogs`, `syncEvents`, `syncCounters`. Fields and indexes are documented in
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

23 paths under `/api/v1`, in the groups Authentication, Users, Settings, Devices, Account
and Health. See [`docs/api/openapi.json`](../api/openapi.json) and
[`docs/api/overview.md`](../api/overview.md).

## Tests executed

| Suite                         | Result              |
| ----------------------------- | ------------------- |
| `@personalitify/api`          | 84 passed (8 files) |
| `@personalitify/web`          | 2 passed (1 file)   |
| `@personalitify/localization` | 5 passed (1 file)   |

Backend coverage by area:

- **Authentication** (22): registration, credential storage, cookie delivery, duplicate
  email, localized validation, login, refresh rotation, racing duplicate, token replay,
  expired sessions, logout, session list and revocation, email verification, password reset
  and change.
- **Authorization** (9): every protected route in the registry answers 401 without a token;
  malformed, foreign-signed and expired tokens; tokens for missing or foreign sessions; data
  isolation between two users; device management.
- **Entity service** (19): versioning, client ids, nested merge, validation, stale-update
  merge, conflicts, concurrent writers, tombstones, ownership, limits, pagination, sequence
  numbers, crash recovery by the sweeper, exactly-once logging under repeated and concurrent
  relays, failing subscribers.
- **Security** (13): headers, request ids, CORS, NoSQL injection, malformed and oversized
  bodies, information leakage, rate limiting, password hashing.
- **Account** (8): profile and settings updates, conflict detection over HTTP, event log
  contents, export without secrets, security log, account deletion, data registry.
- **API documentation** (6): the document covers every route, unique operation ids, path
  parameters, request schemas, the docs page, and the committed file matches the code.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification against the running server: registration with Turkish defaults,
localized validation errors, account deletion, the docs page, and production-strength
password hashing (about 280 ms per hash on the development machine).

## Build results

`npm run build` succeeded.

## Known limitations

- Rate-limit counters live in process memory; a multi-instance deployment needs a shared
  store.
- Realtime delivery of events and the client-facing synchronization endpoints arrive in
  Phases 12 and 13; this phase persists and orders the events they will serve.
- There is no email-change flow yet.

## Git

| Commit    | Message                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `4942d5e` | feat(contracts): add event, preference and error message contracts            |
| `d11f53e` | feat(sync): add versioned entity service with atomic outbox and event log     |
| `63c4231` | feat(auth): implement secure authentication, sessions and device registration |
| `d3be8f8` | docs(api): generate OpenAPI document and add API overview                     |
| `4b7d4eb` | docs(architecture): document backend structure and database schema            |

Push status: pushed to `origin/main` and verified (`origin/main` = `4b7d4eb`).
GitHub Actions: the CI workflow completed successfully for `4b7d4eb` on Node 22 and Node 24.

## Next phase

Phase 3 — Frontend foundation and design system.
