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
`weekStart`, `notifications { … quietHours }`, `privacy`, `focus`, `dashboard.widgets`.

`focus` holds the timer lengths in minutes (`focusMinutes`, `shortBreakMinutes`,
`longBreakMinutes`) and `longBreakEvery`. Accounts created before the timer existed read
the defaults.

`dashboard.widgets` is the user's order and visibility of dashboard widgets. Only what the
user arranged is stored; on read the list is completed with every known widget, so a widget
added to the product later appears on existing dashboards without a migration.
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

### `categories` (synchronized)

User-defined labels shared by habits, goals, tasks and events: `name`, `color`, `icon`,
`sortOrder`. At most 100 per user.
Indexes: `{ userId: 1, deletedAt: 1, sortOrder: 1 }`.

Deleting a category does not cascade in the database. Each module subscribes to
`category.deleted` and clears its own references through the entity service, so those
changes are versioned and synchronized too.

### `habits` (synchronized)

| Field                                                | Notes                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `name`, `description`, `color`, `icon`, `categoryId` |                                                                               |
| `schedule`                                           | `mode` (`fixed` \| `flexible`), `recurrence` rule, `period`, `timesPerPeriod` |
| `target`                                             | `kind` (`check` \| `count` \| `duration`), `value`, `unit`                    |
| `startDate`, `endDate`                               | Calendar dates (`YYYY-MM-DD`) in the user's time zone                         |
| `reminders`                                          | Embedded, at most 8: `{ time: "HH:mm", enabled }`                             |
| `streakGoal`                                         | Optional streak length the user aims for                                      |
| `archivedAt`                                         | Archived habits keep their history and leave the daily views                  |
| `sortOrder`                                          |                                                                               |

At most 200 per user.
Indexes: `{ userId: 1, deletedAt: 1, archivedAt: 1, sortOrder: 1 }` ·
`{ userId: 1, categoryId: 1 }`.

### `habitCompletions` (synchronized, entity type `habitEntry`)

What was recorded for one habit on one calendar day.

| Field             | Notes                                                        |
| ----------------- | ------------------------------------------------------------ |
| `habitId`, `date` | Immutable; `date` is a calendar date in the user's time zone |
| `status`          | `active` \| `skipped` \| `postponed`                         |
| `value`           | Progress of the day                                          |
| `target`          | Copy of the habit's target when the entry was written        |
| `note`            |                                                              |
| `postponedTo`     | The day an occurrence was moved to                           |
| `completedAt`     | Instant at which `value` first reached `target`              |

Indexes: `{ userId: 1, habitId: 1, date: 1 }` unique among live documents (partial on
`deletedAt` being null) · `{ userId: 1, date: 1 }` · `{ userId: 1, postponedTo: 1 }` partial.

Design notes:

- One document per habit and day keeps the collection bounded by time, not by taps:
  counting to eight glasses of water updates one entry eight times.
- The unique index makes "the entry of that day" a well-defined thing even when two devices
  write the first progress of a day at the same moment; the loser of that race updates the
  winner's entry.
- `target` is stored on the entry so that raising a habit's target later does not turn past
  completed days into incomplete ones.
- Streaks and completion rates are not stored. They are derived from the entries and the
  schedule on request, so they can never disagree with the data.

### `goals` (synchronized)

| Field                                                 | Notes                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `title`, `description`, `color`, `icon`, `categoryId` |                                                                                                |
| `horizon`                                             | `short` \| `long`                                                                              |
| `startDate`, `targetDate`                             | Calendar dates in the user's time zone                                                         |
| `status`                                              | `active` \| `paused` \| `completed` \| `abandoned`; `completedAt` follows it                   |
| `progress`                                            | `mode` (`manual` \| `milestones` \| `tasks` \| `metric`), `value`, `current`, `target`, `unit` |
| `milestones`                                          | Embedded, at most 50: `{ id, title, targetDate, done, completedAt }`                           |
| `reviews`                                             | Embedded, at most 100: `{ id, date, note, rating, percent }`                                   |
| `parentGoalId`                                        | Sub-goals, nested at most three levels; cycles are rejected                                    |
| `habitIds`                                            | Linked habits, at most 20                                                                      |

At most 300 per user.
Indexes: `{ userId: 1, deletedAt: 1, status: 1, sortOrder: 1 }` · `{ userId: 1, parentGoalId: 1 }`
· `{ userId: 1, categoryId: 1 }` · `{ userId: 1, habitIds: 1 }`.

Milestones and reviews are embedded because they are small, bounded and always read with
their goal. A goal's percentage is not stored: it is derived from the progress mode on
every read (for the `tasks` mode with one aggregation over the goal's tasks).

### `tasks` (synchronized)

| Field                                                      | Notes                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `title`, `description`, `categoryId`, `priority`, `status` |                                                       |
| `startDate`, `dueDate`, `dueTime`                          | Calendar dates and a time of day                      |
| `scheduledDate`, `scheduledTime`, `durationMinutes`        | A planned time block for the calendar                 |
| `completedAt`, `completedOn`                               | Instant, and the user's calendar date at that instant |
| `originalDueDate`, `postponedCount`                        | The first due date and how often the task was moved   |
| `subtasks`                                                 | Embedded, at most 50: `{ id, title, done }`           |
| `recurring`, `recurrence`, `recurrenceEndDate`             | Repeating tasks                                       |
| `seriesId`, `seriesStartDate`                              | Shared by all occurrences of a repeating task         |
| `goalId`, `habitId`                                        | Optional links                                        |

At most 5000 per user.
Indexes: `{ userId: 1, deletedAt: 1, status: 1, dueDate: 1 }` ·
`{ userId: 1, deletedAt: 1, scheduledDate: 1 }` · `{ userId: 1, deletedAt: 1, completedOn: 1 }` ·
`{ userId: 1, goalId: 1 }` · `{ userId: 1, habitId: 1 }` · `{ userId: 1, categoryId: 1 }` ·
`{ userId: 1, seriesId: 1, dueDate: 1 }` unique among live occurrences of a series.

Design notes:

- **A repeating task is a series of separate tasks.** Completing an occurrence creates the
  next one, so every occurrence keeps its own completion time, notes and checklist. The
  unique index on series and due date makes that creation idempotent: completing, reopening
  and completing again, or two devices completing at once, never yields two copies.
- **`completedOn` is stored** because "what did I finish today" must be answered in the
  user's calendar, and the time zone at the moment of completion is the one that counts.
- **Dates are never silently lost.** The first due date survives postponing and editing in
  `originalDueDate`; overdue tasks are a query, not a state that expires.

### `calendarEvents` (synchronized, entity type `calendarEvent`)

| Field                                                             | Notes                                          |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `title`, `description`, `location`, `categoryId`, `color`, `kind` | `kind`: `event`                                | `block` |
| `allDay`                                                          | All-day events are plain calendar dates        |
| `timeZone`                                                        | IANA zone the wall-clock times are written in  |
| `startDate`, `startTime`, `endDate`, `endTime`                    | First (or only) occurrence, in `timeZone`      |
| `recurring`, `recurrence`, `recurrenceEndDate`                    | Repeating events                               |
| `excludedDates`                                                   | Occurrences removed from a series; at most 366 |
| `reminderMinutes`                                                 | Minutes before the start; at most 5            |
| `taskId`, `habitId`, `goalId`                                     | Optional links                                 |

At most 5000 per user.
Indexes: `{ userId: 1, deletedAt: 1, recurring: 1, startDate: 1, endDate: 1 }` ·
`{ userId: 1, categoryId: 1 }` · `{ userId: 1, goalId: 1 }` · `{ userId: 1, taskId: 1 }` ·
`{ userId: 1, habitId: 1 }`.

Design notes:

- **A repeating event is one document.** Its occurrences are computed when a range is
  requested, unlike repeating tasks, whose occurrences are separate documents because each
  one has state of its own (done, notes, checklist). An event occurrence has no state.
- **Wall-clock time plus zone, not instants.** Storing "10:00 Europe/Istanbul" keeps a
  series at 10:00 through daylight-saving changes; storing instants would not.
- **The unified calendar is not stored.** `GET /calendar` builds it per request from
  events, tasks and habits.

### `focusSessions` (synchronized, entity type `focusSession`)

| Field                                 | Notes                                                  |
| ------------------------------------- | ------------------------------------------------------ |
| `kind`                                | `focus`, `short_break`, `long_break`                   |
| `status`                              | `running`, `paused`, `completed`, `cancelled`          |
| `active`                              | True while running or paused; internal, never returned |
| `plannedMinutes`                      | 1–180                                                  |
| `startedAt`, `pausedAt`, `endedAt`    | Instants, always set by the server                     |
| `pausedSeconds`                       | Time spent paused so far                               |
| `elapsedSeconds`                      | Time spent without pauses; final once ended            |
| `date`                                | The user's calendar date when the session started      |
| `note`, `taskId`, `habitId`, `goalId` | Optional note and links                                |

Indexes: `{ userId: 1, deletedAt: 1, date: 1 }` · `{ userId: 1, deletedAt: 1, startedAt: -1 }` ·
`{ userId: 1, taskId: 1 }` · `{ userId: 1 }` unique where `active` is true and the document
is not deleted.

Design notes:

- **The server owns the clock.** Clients ask to start, pause, resume and finish; they never
  send a duration. The end of a running session is derived (`startedAt + plannedMinutes +
pausedSeconds`), so there is nothing to keep in step while it runs.
- **One active session per user is an index, not a check.** Two devices starting at the same
  moment cannot both succeed.
- **A session that runs out is completed when it is next read**, at its planned end, whether
  or not any client was open.

### `journalEntries` (synchronized, entity type `journalEntry`)

| Field           | Notes                                               |
| --------------- | --------------------------------------------------- |
| `kind`          | `journal` (about a day) or `note`                   |
| `title`, `body` | `body` is Markdown, at most 50,000 characters       |
| `date`          | The day the entry is about, in the user's time zone |
| `tags`          | Lower case, at most 12                              |
| `pinned`        | Pinned entries are listed first                     |
| `searchText`    | Title, text and tags folded for searching; internal |

At most 5000 per user.
Indexes: `{ userId: 1, deletedAt: 1, pinned: -1, date: -1, updatedAt: -1 }` ·
`{ userId: 1, deletedAt: 1, tags: 1 }`.

Design notes:

- **Search is a folded copy, not a text index.** `searchText` is lower case, without accents
  and with every form of the letter i as one, so a search behaves the same in Turkish and
  English and matches inside words. It is scanned within one user's entries, which the
  per-user limit keeps small.
- **Lists never return bodies**, only a plain-text preview — and no preview when the user
  hides sensitive previews.

### `journalRevisions`

Earlier contents of journal entries: `userId`, `entryId`, `entryVersion`, `title`, `body`,
`replacedAt`. Written by the server when the title or body of an entry is replaced; the
newest 20 per entry are kept, and all are removed with the entry. Not a synchronized entity:
revisions are history kept by the server, read on request.
Indexes: `{ userId: 1, entryId: 1, replacedAt: -1 }`.

### `moodEntries` (synchronized, entity type `moodEntry`)

One per user and calendar day: `date`, `score` (1–5), `emotions` (from a fixed list), `note`.
Indexes: `{ userId: 1, date: 1 }` unique among live documents.

### References between entities

There are no database-level cascades. `core/entity/references.js` registers, per reference,
a subscriber that reacts to `<entity>.deleted` and clears the reference through the entity
service:

| Deleted    | Detached from                                |
| ---------- | -------------------------------------------- |
| `category` | habits, goals, tasks (`categoryId`)          |
| `goal`     | sub-goals (`parentGoalId`), tasks (`goalId`) |
| `habit`    | goals (`habitIds`), tasks (`habitId`)        |

Calendar events and focus sessions are detached in the same way from a deleted task, habit
or goal (`taskId`, `habitId`, `goalId`).

## Account export and deletion

`core/user-data.js` keeps a registry of every collection that holds personal data. Export
and deletion iterate over it, so a module that registers its collection is automatically
covered by both. Collections that hold only secrets or derived data (sessions, tokens, event
history) are registered for deletion but excluded from the export.

## Transactions

None are used. Atomicity between an entity change and its event comes from writing both in
one document (ADR-004). Effects that span documents are implemented as idempotent event
subscribers.
