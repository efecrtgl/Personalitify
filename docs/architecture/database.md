# Database

MongoDB through Mongoose. The schema is designed to run on a standalone server (no replica
set), which is what a default MongoDB Community Server installation provides.

This document lists collections as they are introduced. Later phases append their own.

## Conventions

- **Identifiers** are UUID strings in `_id`. They are exposed as `id`.
- **Ownership.** Every user-owned document has `userId`. Services never query without it.
- **Timestamps.** `createdAt` / `updatedAt` on every collection.
- **Serialization.** Each model exports a serializer. Raw documents never leave a service.
- **Secrets** (`passwordHash`, `tokenHash`) are `select: false` and absent from serializers.
- **Embedding** only for small, bounded structures. Anything unbounded gets a collection.
- **Deletion.** Synchronized entities are soft-deleted (tombstones). Infrastructure records
  (sessions, tokens, audit entries) expire through TTL indexes.

### Synchronized entities

Collections that use the `syncedEntity` plugin (`database/plugins/synced-entity.js`) share
these fields:

| Field       | Type          | Purpose                                                   |
| ----------- | ------------- | --------------------------------------------------------- |
| `_id`       | string (UUID) | May be supplied by the client                             |
| `userId`    | string        | Owner, immutable                                          |
| `version`   | int ≥ 1       | Incremented on every change; optimistic concurrency token |
| `deletedAt` | date \| null  | Tombstone                                                 |
| `_outbox`   | array         | Events committed with the entity, not yet in `syncEvents` |

and these indexes:

| Index            | Definition                                         | Purpose                       |
| ---------------- | -------------------------------------------------- | ----------------------------- |
| `pending_outbox` | `{ updatedAt: 1 }`, partial: `_outbox.0` exists    | Sweeper finds stranded events |
| `tombstones`     | `{ deletedAt: 1 }`, partial: `deletedAt` is a date | Tombstone cleanup             |

`_outbox` is not an unbounded array: it holds events only between the write and the relay,
which normally is a few milliseconds.

## Collections

### `users`

Identity and credentials only.

| Field               | Notes                             |
| ------------------- | --------------------------------- |
| `email`             | Lowercased, unique                |
| `passwordHash`      | scrypt, never selected by default |
| `role`              | `user` \| `admin`                 |
| `emailVerifiedAt`   |                                   |
| `passwordChangedAt` |                                   |
| `lastLoginAt`       |                                   |

Indexes: `{ email: 1 }` unique.

### `profiles` (synchronized)

One per user, `_id` = user id. `displayName`, `bio`, `avatarColor`.
Indexes: `{ userId: 1 }` unique.

### `userSettings` (synchronized)

One per user, `_id` = user id. `language`, `theme`, `timeZone`, `dateFormat`, `timeFormat`,
`weekStart`, `notifications { … quietHours }`, `privacy`.
Indexes: `{ userId: 1 }` unique.

Profile and settings are separate documents because they change for different reasons and
at different rates; a theme switch should not conflict with a name change during a merge.

### `devices`

One per client installation per user.

| Field                                                                | Notes                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `installationId`                                                     | UUID chosen by the client, stable for the installation |
| `name`, `clientType`, `platform`, `appId`, `appVersion`, `osVersion` | Reported by the client                                 |
| `pushToken`                                                          | Reserved for native push; never selected by default    |
| `lastSeenAt`                                                         | Updated at most every five minutes                     |
| `syncCursor`, `lastSyncAt`                                           | Synchronization position acknowledged by the device    |

Indexes: `{ userId: 1, installationId: 1 }` unique.

### `sessions`

One signed-in device.

| Field                                  | Notes                                   |
| -------------------------------------- | --------------------------------------- |
| `tokenHash`                            | SHA-256 of the current refresh token    |
| `previousTokenHash`                    | Detects reuse of a rotated token        |
| `rotatedAt`, `lastUsedAt`, `expiresAt` |                                         |
| `revokedAt`, `revokedReason`           |                                         |
| `ip`, `userAgent`                      | Shown in the session list               |
| `purgeAt`                              | TTL: 30 days after expiry or revocation |

Indexes: `{ tokenHash: 1 }` unique · `{ previousTokenHash: 1 }` sparse ·
`{ userId: 1, revokedAt: 1 }` · `{ deviceId: 1 }` · `{ purgeAt: 1 }` TTL.

### `authTokens`

Single-use email tokens (`email-verification`, `password-reset`), stored hashed.
Indexes: `{ tokenHash: 1 }` unique · `{ userId: 1, type: 1 }` · `{ expiresAt: 1 }` TTL.

### `auditLogs`

Security-relevant account actions (sign-ins, failed sign-ins, password changes, token reuse,
exports…). Retained 180 days.
Indexes: `{ userId: 1, createdAt: -1 }` · `{ createdAt: 1 }` TTL.

### `syncEvents`

The durable per-user event log.

| Field                                     | Notes                                                      |
| ----------------------------------------- | ---------------------------------------------------------- |
| `_id`                                     | Event id (UUID)                                            |
| `userId`, `seq`                           | Dense per-user sequence number; the synchronization cursor |
| `type`                                    | `<entityType>.<created\|updated\|deleted>`                 |
| `entityType`, `entityId`, `entityVersion` |                                                            |
| `schemaVersion`                           | Version of the event layout                                |
| `occurredAt`                              | When the change was committed                              |
| `deviceId`, `opId`                        | Origin device and client operation id, when known          |
| `changedFields`                           | Top-level fields changed by this event (drives merging)    |
| `data`                                    | The resource after the change                              |

Indexes: `{ userId: 1, seq: 1 }` unique · `{ userId: 1, entityType: 1, entityId: 1,
entityVersion: 1 }` · `{ userId: 1, occurredAt: -1 }` · `{ createdAt: 1 }`.

### `syncCounters`

One document per user (`_id` = user id) holding the last assigned `seq`. Incremented
atomically with `$inc`.

## Account export and deletion

`core/user-data.js` keeps a registry of every collection that holds personal data. Export
and deletion iterate over it, so a module that registers its collection is automatically
covered by both. Collections that hold only secrets or derived data (sessions, tokens, event
history) are registered for deletion but excluded from the export.

## Transactions

None are used. Atomicity between an entity change and its event comes from writing both in
one document (ADR-004). Effects that span documents are implemented as idempotent event
subscribers.
