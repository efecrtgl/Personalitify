# Phase 4 — Habits and Routines

## Objective

Deliver the habit module end to end — domain rules, storage, API, web client, both languages
and tests — with schedules that stay correct across time zones and daylight-saving changes.

## Implemented

### Time and recurrence core

- `core/time.js`: calendar-date arithmetic in UTC (unaffected by 23- and 25-hour days), and
  the three conversions that involve a time zone: instant → calendar date, first instant of a
  calendar day, calendar date + time of day → instant.
- `core/recurrence.js`: recurrence rules evaluated on calendar dates — daily and every N
  days; weekly on chosen weekdays with week intervals; monthly on chosen days with last-day
  fallback and `-1` for the last day; yearly with 29 February falling on the 28th.
- Documented as a platform contract in
  [`docs/architecture/time-and-recurrence.md`](../architecture/time-and-recurrence.md).

### Habits (API)

- Create, edit, archive, restore, delete; colors, icons, descriptions, categories.
- Schedules: **fixed** (a recurrence rule) or **flexible** (N times per week or month).
- Targets: `check`, `count` (multiple daily occurrences with a unit) and `duration`.
- Start and end dates, up to eight reminder times, an optional streak goal.
- One entry per habit and calendar day: progress (`value` or atomic `increment`), `skipped`,
  `postponed` to a later day, and a note. The entry keeps the target it was recorded with.
- Day view (`GET /habits/day`): every habit relevant on a day with state, progress, period
  progress for flexible habits, current streak, and a day summary.
- History (`GET /habits/{id}/history`) and statistics (`GET /habits/{id}/stats`): current and
  best streak, total completions, completion windows of 7, 30 and 90 days, weekday breakdown.
- Categories shared with later modules; deleting one detaches its habits through an event
  subscriber.

### Habits (web)

- Day view with date navigation, a progress summary, and a completion control: a ring that
  fills in the habit's color, with step buttons for count and duration habits. Updates are
  optimistic and corrected by the server's answer, which carries the recalculated streak.
- Skip, postpone to the next day and clear from each habit's menu.
- Habit form: name, description, color and icon pickers, category, schedule builder (every
  day, days of the week, every few days, days of the month, yearly, or a flexible quota),
  target, dates, reminders, streak goal.
- "All habits" view with active/archived filter, archive, restore, delete, and category
  administration.
- Detail view: four figures, each with a sentence stating how it is calculated; a 16-week
  history grid with legend and text summary; a weekday breakdown; notes.

## Architectural decisions

- **"Today" belongs to the server.** It is derived from the user's time zone and returned
  with the responses; the web client navigates dates but never decides what today is.
- **Derived, not stored.** Streaks and rates are computed from entries and schedule on
  request, so they cannot drift from the data. Pure functions (`habit-schedule.js`) hold the
  rules and are tested day by day without a database or a clock.
- **One entry per habit and day**, enforced by a unique index among live documents. Two
  devices writing the first progress of a day at the same moment converge on one entry.
- **Recurrence weeks are Monday-based** so a rule means the same everywhere; weekly quotas
  and displays follow the user's own first day of the week.
- **Completion rate is `null` when nothing could be judged**, rather than a misleading 0%.
  Skipped and postponed days and a still-open today are excluded from both sides.

## Problems found and fixed during the phase

- **Deadlock in the event relay.** Deleting a category never returned: the subscriber that
  detaches habits writes entities of the same user, and its events queued behind the relay
  task that was waiting for the subscriber. Subscribers now run after the relay leaves the
  per-user queue. Found by the category test timing out; covered by a dedicated regression
  test.
- **Partial recurrence updates were rejected** because the update schema required a complete
  rule. A patch schema without defaults fixes it without resetting sibling fields.
- **Modals focused their close button** instead of the first field (native `<dialog>`
  behaviour); they now start in the first input.
- **The changelog contained a duplicated, truncated Phase 3 entry** left by a failed scripted
  edit in the previous phase; rewritten.

## Important files

`apps/api/src/core/{time,recurrence}.js`,
`apps/api/src/modules/habits/{habit.model,habit-schedule,habits.service,habits.schemas,habits.routes}.js`,
`apps/api/src/modules/categories/*`, `packages/shared-contracts/src/scheduling.js`,
`apps/web/src/pages/habits/*`, `apps/web/src/ui/pickers.jsx`,
`apps/web/src/lib/{dates,icons}.js`,
`packages/localization/locales/{tr,en}/habits.json`.

## Database changes

New collections `categories`, `habits`, `habitCompletions` (entity type `habitEntry`), all
synchronized entities. Fields, indexes and design notes are in
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

15 new operations in the groups Categories (4) and Habits (11). See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 153 passed (11 files) |
| `@personalitify/web`          | 54 passed (6 files)   |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (68):

- **Time and recurrence** (20): strict date validation; arithmetic across months, years and
  leap days; daylight-saving days; week starts; calendar date by zone including UTC+14 and
  UTC−11; the repeated hour in autumn; days without a midnight; wall-clock times before and
  after a clock change; every rule type, intervals, month-end fallback, leap years, end
  dates, next and previous occurrence, input validation.
- **Habit scheduling rules** (24): day states, targets, entries judged by their recorded
  target, postponement making a day due, streaks (open today, missed days, skipped and
  postponed days, non-daily schedules, ended habits), flexible quotas with different week
  starts, weekly and monthly streaks, completion figures.
- **Habits API** (23): defaults, full definitions, ten invalid definitions, nested updates,
  archive and filters, cascade delete with tombstones, "today" per time zone, time zone
  change, relevance on a day, week start, completion with streak, atomic increments from
  concurrent requests, racing first writes, target history, skip, postpone, clear, date
  limits, statistics, history limits, categories, ownership, export.
- **Event relay** (1): a subscriber writing another entity of the same user.

New web tests (10): day view with optimistic completion, increments with rollback, skip,
date navigation, habit creation with a weekly schedule and duration target, edit with
version and server field errors, detail figures and explanations, missing habit, icon
coverage, schedule descriptions in both languages.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification: an account with 60 days of history was seeded through the public API
and the web client was driven in a headless browser — day view, completing a habit, the
form, the management list, detail views for a fixed and a flexible habit, dark theme and a
390 px viewport — with no console errors or warnings.

## Build results

`npm run build` succeeded: 666.9 kB JavaScript (208.1 kB gzip).

## Known limitations

- Reminder times are stored and edited; delivery arrives with the notification engine in
  Phase 11.
- Postponing from the web client moves an occurrence to the next day; the API accepts any
  later date within 31 days.
- Yearly schedules cannot choose a month and day other than the start date's.
- Streaks are followed back for at most 1100 days.

## Git

| Commit    | Message                                                         |
| --------- | --------------------------------------------------------------- |
| `ff441e7` | feat(core): add calendar-date arithmetic and recurrence rules   |
| `db5c389` | fix(events): run subscribers outside the per-user relay queue   |
| `690f352` | feat(habits): add recurring habit management                    |
| `3fc2ddb` | feat(api-client): add category and habit endpoints              |
| `2f36a66` | feat(web): add habit day view, management and detail screens    |
| `692b908` | docs: record phase 4 in changelog and roadmap, repair changelog |

Push status: pushed to `origin/main` and verified (`origin/main` = `692b908`).
GitHub Actions: the CI workflow completed successfully for `692b908` on Node 22 and Node 24.

## Next phase

Phase 5 — Goals and tasks.
