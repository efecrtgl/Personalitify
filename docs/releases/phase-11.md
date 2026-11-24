# Phase 11 — Notifications and Background Jobs

## Objective

Let the server tell the user things at the right moment — a habit reminder at 09:00 in their
own time zone, a task that is due, an achievement that was unlocked — without a queue
server, without telling them twice, and with their preferences respected.

## Implemented

### Background jobs (API)

- An in-process job runner (`core/jobs.js`): a job is a named function on an interval. A
  **lock per job in MongoDB** lets only one process run it at a time, expires by itself if
  the process dies, and records each run's start, end, duration and last error.
- Three jobs, started with the server and stopped on shutdown: `reminders` (every minute),
  `focus-timers` (every 15 seconds) and `notifications-cleanup` (every 6 hours).
- The timer from Phase 9 now **ends on time by itself**: the `focus-timers` job completes
  sessions whose time is up, whether or not a client is open.

### Notifications (API)

- A notification is a kind with its values (`params`), not a sentence; clients phrase it.
  Kinds: `habit_reminder`, `task_due`, `tasks_today`, `goal_deadline`, `event_reminder`,
  `achievement_unlocked`, `focus_completed`.
- **Reminders** in the user's time zone:
  - a habit at each of its reminder times, while it is still open that day (not when it is
    completed or skipped; a flexible habit while its weekly or monthly quota is not met);
  - an open task at its due date and time;
  - once a day at 09:00, a summary of tasks due today and still open from before;
  - an active goal three days before its target date and on the day;
  - a calendar event at each of its reminders before the start, including every occurrence
    of a repeating event.
- **Exactly once.** Each notification has a key that names the occasion, unique per user.
  A job that runs twice, overlapping windows, or two racing processes create it once; a
  reminder the user deleted is not made again.
- After downtime, reminders up to 15 minutes late are still sent; older ones are not.
- An unlocked achievement and a timer that ran its full length are announced through event
  subscribers — the modules that produce them know nothing about notifications.
- **Preferences are honoured**: the main switch, the switch of each kind, and quiet hours
  (a notification made in quiet hours is stored as `silent`; clients must not alert for it).
- Endpoints: list (with the unread total), unread count, mark read / unread, mark all read,
  delete. There is no endpoint to create one.
- A small seam for further channels (`registerNotificationChannel`), called for every new
  notification that is not silent. No push or e-mail channel is configured or simulated.
- Notifications older than 60 days are removed.

### Notifications (web)

- A bell in the top bar with the number of unread notifications. Its panel lists the latest
  twenty with an icon, the sentence in the user's language, how long ago, and an "unread"
  label; opening one marks it as read and goes to what it is about; all can be marked as
  read; each can be deleted; a link leads to the notification settings.
- The panel closes on Escape (returning focus to the bell) and on a click outside. The bell
  asks the server once a minute and after every change made in the app.

## Architectural decisions

- **Jobs inside the API process, coordinated through MongoDB**, instead of a queue service:
  nothing extra to install, and correct with one process or several. See
  [`docs/architecture/notifications-and-jobs.md`](../architecture/notifications-and-jobs.md).
- **Idempotency by key, not by bookkeeping.** The reminder job keeps no list of what it has
  sent; the unique key of the occasion makes repeating harmless.
- **Reminders are computed from a time window**, by asking each thing when it would remind,
  rather than scheduling a future job per reminder. Editing a reminder needs no
  rescheduling, and nothing is left behind when a habit is deleted.
- **Kinds and values instead of text**, so every client — including the planned desktop
  client — can phrase notifications in the user's language and link them to the right place.
- **Quiet hours silence, they do not discard.** The user still finds the notification in the
  list afterwards.
- **Subscribers for cross-module news.** Achievements and the timer emit their usual events;
  the notification module listens.

## Problems found and fixed during the phase

- **A dashboard test had been passing for the wrong reason.** It looked for the date
  "24 Kasım Salı" anywhere on the screen and found it in the top bar's clock before the
  dashboard had loaded — true only while the real date was 24 November. When the date rolled
  over during this phase it failed. The assertion now looks at the date under the greeting,
  which comes from the server's answer.
- **Listing order with equal timestamps.** With a frozen test clock several notifications
  share a creation time; the list has a stable tie-break, and the tests select by content.

## Important files

`apps/api/src/core/jobs.js`,
`apps/api/src/modules/notifications/{notification.model,notifications.service,reminders,notifications.jobs,notifications.routes}.js`,
`apps/api/src/modules/focus/focus.service.js` (`completeExpiredSessions`),
`packages/shared-contracts/src/notifications.js`,
`apps/web/src/layout/NotificationsMenu.jsx`,
`packages/localization/locales/{tr,en}/notifications.json`,
`docs/architecture/notifications-and-jobs.md`.

## Database changes

New collections `notifications` (entity type `notification`) and `jobLocks`. See
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

6 new operations in the group Notifications. See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 276 passed (21 files) |
| `@personalitify/web`          | 123 passed (16 files) |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (12):

- **Quiet hours** (1): spans within a day and across midnight, disabled and empty spans.
- **Job runner** (2): one run at a time under concurrent attempts, the previous run passed
  on, and the recorded status; a recorded failure, a freed lock, and taking over a lock that
  expired after a dead process.
- **Notifications** (9): a habit reminded at its time, once, only while open (completed,
  skipped, not due and flexible habits); tasks at their time and the daily summary; goal
  deadlines three days ahead and on the day; events ahead of their start, including a
  repeating one; the user's time zone and the 15-minute catch-up limit; settings per kind,
  silence in quiet hours with the channel not called, and the main switch; unlocked
  achievements and a timer that ran out, ended by the job; listing, paging, read, unread,
  read-all, delete, no re-creation after delete, isolation and export; the jobs through the
  runner and the 60-day cleanup.

New web tests (5): every kind phrased from its values; the unread count, the list and
closing with Escape; opening a notification (marked as read, navigation); mark all as read
and delete; empty and failed states.

Also passing: `npm run lint`, `npm run format:check`. The final local run completed without
a native worker crash.

Manual verification: with the development servers running, a habit was given a reminder one
minute ahead; the **live reminder job** delivered it, and the bell showed it together with
the achievement notifications of the seeded account — checked at desktop and phone width,
with no console errors and no sideways scrolling.

## Build results

`npm run build` succeeded: 1,422.1 kB JavaScript (420.9 kB gzip).

## Known limitations

- Notifications appear in the app only. There is no push, e-mail or browser notification;
  the channel seam exists, a provider does not.
- The bell polls once a minute; live delivery arrives with Phase 12.
- The reminder job visits every account with notifications switched on, once a minute —
  appropriate for a personal or small shared installation, not for a very large one.
- The daily notifications are made at 09:00 local time; the time is not configurable.
- Tasks remind at their due time only; there is no "remind me earlier" for tasks (events
  have it).
- If the server is down for more than 15 minutes, reminders that fell due in that time are
  skipped rather than sent late.

## Git

| Commit    | Message                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `12a5523` | test(web): stop the dashboard date assertion from depending on today's date |
| `677fd1e` | feat(api): add an in-process job runner with database locks                 |
| `71441df` | feat(notifications): add reminders, notifications and their jobs            |
| `05e235b` | feat(api-client): add notifications                                         |
| `181b565` | feat(web): add the notification bell                                        |
| `0ef52e5` | docs: document notifications and jobs and record phase 11                   |

Push status: pushed to `origin/main` and verified (`origin/main` = `0ef52e5`).
GitHub Actions: the CI workflow completed successfully for `0ef52e5` on Node 22 and Node 24.

## Next phase

Phase 12 — Event infrastructure and realtime.
