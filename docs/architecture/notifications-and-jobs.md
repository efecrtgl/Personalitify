# Notifications and background jobs

Code: `apps/api/src/core/jobs.js`, `apps/api/src/modules/notifications`. Endpoints:
`/api/v1/notifications…` (group Notifications in the OpenAPI document).

## Background jobs

Some work has no request to hang on: a reminder falls due at 09:00 whether or not anyone is
using the app. Personalitify runs such work **inside the API process** — there is no queue
server to install, in keeping with "Node.js and MongoDB are all you need".

A job is a named function with an interval (`defineJob`). What makes that safe when more
than one API process runs against the same database is a **lock per job in MongoDB**
(`jobLocks`):

- before a run, the process takes the lock with one atomic update that succeeds only if the
  lock is free or has expired;
- the lock carries an expiry (five intervals, at least a minute), so a process that dies
  mid-run does not block the job for ever;
- after the run the lock is released and the run's start, end, duration and last error are
  recorded — the collection doubles as a status page for operators.

Every job is **idempotent**: after a crash the same work is attempted again, and doing it
twice must change nothing.

| Job                     | Every | What it does                                                 |
| ----------------------- | ----- | ------------------------------------------------------------ |
| `reminders`             | 1 min | makes the notifications that fell due since its previous run |
| `focus-timers`          | 15 s  | completes timer sessions whose time is up                    |
| `notifications-cleanup` | 6 h   | removes notifications older than 60 days                     |

(The outbox sweeper from Phase 2 keeps its own timer; it needs no lock because relaying an
event is itself idempotent.)

Jobs start with the server (`startJobs()` in `server.js`) and stop on shutdown. Tests do not
start timers; they call `runJob(name, { now })` or the job's function directly.

Limits, stated plainly: the reminder job walks every account that has notifications
switched on, once a minute. That is right for a personal or small shared installation and
would need a due-time index and batching for a very large one.

## Notifications

A notification is a **kind and its values**, not a finished sentence:

```json
{
  "kind": "habit_reminder",
  "params": { "name": "Read", "time": "09:00" },
  "entityType": "habit",
  "entityId": "…",
  "silent": false,
  "read": false
}
```

Every client phrases it in the user's language (the web client's sentences live in
`packages/localization/locales/*/notifications.json`), and `entityType`/`entityId` say what
to open. Notifications are synchronized entities, so they reach every device like any other
record, and marking one as read on the phone marks it as read everywhere.

| Kind                   | Made when                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| `habit_reminder`       | a habit's reminder time arrives and the habit is still open that day     |
| `task_due`             | an open task's due date and time arrive                                  |
| `tasks_today`          | 09:00: tasks are due today or still open from before (one summary a day) |
| `goal_deadline`        | 09:00: an active goal's target date is in three days, or today           |
| `event_reminder`       | an event's reminder (minutes before its start) arrives                   |
| `achievement_unlocked` | an achievement is unlocked                                               |
| `focus_completed`      | a timer session ran its full length                                      |

All times are the user's own: "09:00" is 09:00 in the time zone of their settings.

### Exactly once

Each notification has a `dedupeKey` that names the **occasion** — for example
`habit:<id>:2026-11-24:09:00` — with a unique index per user. A job that runs twice, a
window that overlaps the previous one, or two processes that race can only ever create the
notification once. The key survives deletion: a reminder the user dismissed is not made
again.

### How reminders are found

The reminder job looks at the window from its previous run to now. For each thing that can
remind, it asks at which instant it would do so and keeps the ones inside the window. After
downtime the window is capped at 15 minutes: a reminder from ten minutes ago is still sent,
one from two hours ago is not — late is useful only for a while.

A reminder is sent only while there is something left to do: not for a habit that is
already completed or skipped today, not for a finished task.

### Preferences

`settings.notifications` decides what is made at all:

- `inApp: false` — nothing is made;
- `habitReminders`, `taskReminders`, `goalReminders`, `eventReminders`, `achievements` —
  switch their kinds off individually;
- `quietHours` — a notification made during the user's quiet hours is stored with
  `silent: true`: it appears in the list, but clients must not alert for it.

### Other channels (push, e-mail)

The list in the app is the only channel that is built. The seam for more is in place and
deliberately small: `registerNotificationChannel(name, deliver)` is called once for every
new notification that is not silent. A push channel would look up the user's device tokens
and send the kind and values; nothing in the modules that create notifications would
change. No push service is configured or pretended.

### Retention

Notifications older than 60 days are removed by the server. Clients may drop theirs by the
same rule; nothing refers to a notification after that.

## Web client

The bell in the top bar shows the number of unread notifications and opens the latest
twenty: open one to mark it as read and go to what it is about, mark all as read, or delete
one. Until live updates arrive (Phase 12) the bell asks the server once a minute and after
every change made in the app.
