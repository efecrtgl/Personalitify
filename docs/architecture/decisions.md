# Architecture Decision Records

Each record states the context, the decision and its consequences. Records are appended, not
rewritten; a superseded decision is marked as such and linked to its replacement.

---

## ADR-001 — JavaScript only, ES modules

**Context.** The project owner requires JavaScript across the whole codebase.

**Decision.** All source is modern JavaScript with ES modules (`"type": "module"`). No `.ts`
or `.tsx` files, no TypeScript compiler. Runtime validation (zod) and JSON Schemas provide the
contract safety that static types would otherwise give. JSDoc is used where a signature is not
obvious.

**Consequences.** Contracts must be enforced at runtime boundaries and covered by tests.

## ADR-002 — npm workspaces monorepo

**Decision.** A single repository with npm workspaces (`apps/*`, `packages/*`). No additional
monorepo tooling.

**Consequences.** One `npm install`, one lockfile, shared packages resolved by symlink.

## ADR-003 — Modular monolith

**Decision.** One Express process with strict internal module boundaries. No microservices,
no message broker, no Redis.

**Consequences.** Local development needs only Node.js and MongoDB. Modules communicate
through service functions and domain events, which keeps a later extraction possible.

## ADR-004 — Standalone MongoDB is the baseline; atomicity through an embedded outbox

**Context.** MongoDB multi-document transactions require a replica set. A default MongoDB
Community Server installation is standalone, and requiring a replica set would break the
"install MongoDB and run `npm run dev`" promise. Yet an entity change and its domain event
must never diverge.

**Decision.** Every synchronized entity document carries a small internal array of pending
events. A mutation updates the entity and appends its event **in one single-document write**,
which MongoDB guarantees to be atomic everywhere. A relay then copies pending events into the
`syncEvents` collection (idempotent on `eventId`) and removes them from the entity. The relay
runs right after each write and again from a periodic sweeper, so a crash between the two
steps only delays delivery.

**Consequences.**

- Reliable event persistence with no transaction support.
- Delivery is at-least-once; consumers are idempotent.
- Cross-entity effects (for example awarding experience points after a habit completion) are
  implemented as idempotent event consumers rather than as multi-document transactions.
- The pending array is bounded in practice because it is drained immediately.

## ADR-005 — Per-user dense sequence numbers as the synchronization cursor

**Decision.** The relay assigns each event a per-user integer `seq` from an atomic counter.
A client's cursor is the highest `seq` it has applied. Readers return only a contiguous run
of sequence numbers; a gap that is still fresh means an insert is in flight and the reader
stops before it, a gap older than a few seconds is treated as abandoned (the event behind it
is still in its entity's outbox and will be relayed under a new number).

**Consequences.** Cursors are trivial for any client language. No event can be skipped by a
reader that races with a writer.

## ADR-006 — UUID string identifiers, optionally client-generated

**Decision.** Public identifiers are UUID strings stored as `_id`. A client may provide the id
when creating a resource.

**Consequences.** Offline creation works, create requests are naturally idempotent, and no
client needs to understand MongoDB ObjectIds.

## ADR-007 — Optimistic concurrency with field-level merge

**Decision.** Synchronized entities carry an integer `version`. A mutation states the version
it was based on. If it is current, it applies. If it is stale, the server computes which
fields changed since that version (from the event log); when the incoming fields do not
overlap, the mutation is merged and applied, otherwise the server answers
`409 VERSION_CONFLICT` with the current resource and the conflicting field names. Deletion
wins over a concurrent update. A mutation without a base version is treated as
"apply to latest" and is documented as unsafe for offline clients.

**Consequences.** Older writes never silently overwrite newer ones; most concurrent edits to
different fields merge without user involvement.

## ADR-008 — Authentication: JWT access tokens + rotating opaque refresh tokens

**Decision.** Access tokens are short-lived HS256 JWTs. Refresh tokens are random opaque
strings stored as SHA-256 hashes, bound to a session and a device, and rotated on every use
with reuse detection. Browser clients get the refresh token in an `HttpOnly` cookie, native
clients in the response body. Session validity is checked on every authenticated request so
revocation is immediate.

**Consequences.** The same auth endpoints serve web and native clients. A stolen refresh token
is detected when it is reused.

## ADR-009 — Password hashing with scrypt from Node.js core

**Decision.** `crypto.scrypt` with a per-user salt and the parameters encoded in the stored
hash. No native add-on dependency.

**Consequences.** Installation never needs a compiler toolchain on Windows. Parameters can be
raised and hashes upgraded on next login.

## ADR-010 — Validation with zod; OpenAPI generated from route definitions

**Decision.** Request and response shapes are zod schemas attached to route definitions. The
OpenAPI document is generated from the same definitions, so the documentation cannot drift
from the implementation.

## ADR-011 — Time handling with Luxon and local calendar dates

**Decision.** Luxon performs all zone-aware arithmetic. Daily concepts are keyed by the local
date in the user's IANA zone. Recurrence rules are an explicit, documented JSON structure
evaluated on calendar dates by the backend; clients request occurrences instead of
re-implementing the rules.

## ADR-012 — Realtime over Socket.IO, replay over REST

**Decision.** Socket.IO delivers already-persisted events to user-scoped and device-scoped
rooms. Recovery after disconnection uses `GET /sync/changes`. Socket.IO is an open protocol
with client implementations outside JavaScript (including Rust); a client can also operate
correctly with REST polling alone.

## ADR-013 — In-process job runner with database locks

**Decision.** Background jobs (reminders, outbox sweeping, cleanup) run inside the API process
on timers. A lock document per job run prevents duplicate execution if several instances run.

**Consequences.** No external scheduler or broker is needed.

## ADR-014 — Shared localization catalogs

**Decision.** `packages/localization` holds all messages for Turkish (default) and English.
Both the API and the web client read from it. A test fails when the two languages do not have
identical key sets.

## ADR-015 — Documentation languages

**Decision.** Onboarding documents (README, setup, troubleshooting, contributing) are provided
in Turkish and English. Technical contracts (architecture, API, synchronization, Rust client
guide) are written in English, the working language of the APIs they describe.

## ADR-016 — Testing against a real MongoDB

**Decision.** Backend integration tests run against a dedicated database on the developer's
local MongoDB server and against a MongoDB service container in CI. No in-memory fakes.

**Consequences.** Tests exercise real indexes and query behaviour. A running MongoDB is
required to run the backend test suite.
