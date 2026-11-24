# Time, Calendar Dates and Recurrence

Habits, tasks, calendar events, reminders and statistics all depend on the answer to "which
day is it for this user?". These rules are part of the platform contract: every client must
be able to rely on them, and no client re-implements them.

## Three kinds of time values

| Kind          | Format       | Meaning                                        |
| ------------- | ------------ | ---------------------------------------------- |
| Instant       | ISO 8601 UTC | A point in time. `completedAt`, `createdAt`    |
| Calendar date | `YYYY-MM-DD` | A day on the user's calendar. No time, no zone |
| Time of day   | `HH:mm`      | A wall-clock time on the user's calendar       |

A calendar date is **not** an instant at midnight UTC. `2026-11-25` for a user in Istanbul
begins at `2026-11-24T21:00:00Z`.

## The user's day

- The user's time zone is `settings.timeZone`, an IANA name.
- **Today** is the calendar date it currently is in that zone. The server computes it and
  returns it (`today`) with every response where it matters. Clients display and navigate
  dates but never decide what today is from their own clock or zone.
- Changing the time zone takes effect immediately. Recorded entries keep the calendar dates
  they were recorded with; nothing is re-dated.
- Entries may be recorded for today, for past days and — as tolerance for a device whose zone
  is ahead of the account's — for tomorrow, but not further into the future.

## Arithmetic

All arithmetic on calendar dates (add days, difference, weekday, week and month boundaries)
is done in UTC, where every day has 24 hours. Daylight-saving transitions therefore cannot
shift or skip a date. A time zone is involved only when converting between an instant and a
calendar date, or when placing a time of day on a date:

| Operation                             | Function (`apps/api/src/core/time.js`) |
| ------------------------------------- | -------------------------------------- |
| Instant → calendar date in a zone     | `localDateInZone`, `todayInZone`       |
| First instant of a calendar day       | `startOfLocalDay`                      |
| Calendar date + time of day → instant | `instantAt`                            |

Consequences that are covered by tests:

- A day may be 23 or 25 hours long; it is still one calendar date.
- A day may have no midnight (clocks jump from 00:00 to 01:00); its first instant is the
  first one that exists.
- A reminder at `08:00` is at a different UTC instant before and after a clock change, but
  always at 08:00 on the user's clock.

## Weeks

- **Recurrence** counts weeks from Monday to Sunday. A rule such as "every two weeks on
  Monday and Friday" must mean the same on every device and for every user, so it does not
  depend on display preferences.
- **Display and weekly quotas** follow `settings.weekStart` (Monday, Saturday or Sunday):
  "three times this week" uses the week the user sees in their calendar.

## Recurrence rules

```json
{ "frequency": "weekly", "interval": 2, "weekdays": [1, 5], "monthDays": [] }
```

| Field       | Values                                 | Meaning                                       |
| ----------- | -------------------------------------- | --------------------------------------------- |
| `frequency` | `daily`, `weekly`, `monthly`, `yearly` |                                               |
| `interval`  | 1–365                                  | Every N days, weeks, months or years          |
| `weekdays`  | ISO weekdays, Monday = 1 … Sunday = 7  | Weekly rules. Empty: the start date's weekday |
| `monthDays` | 1–31, or -1 for the last day           | Monthly rules. Empty: the start date's day    |

A rule is evaluated against a **start date**; nothing occurs before it. An optional **end
date** on the owning entity is the last date on which the rule may occur.

- `daily` — on the start date and every `interval` days after it.
- `weekly` — in every `interval`-th calendar week counted from the week of the start date,
  on the listed weekdays. In the starting week only days on or after the start date occur.
- `monthly` — in every `interval`-th month, on the listed days. A day the month does not
  have falls on its last day: "the 31st" is 30 April and 28 or 29 February.
- `yearly` — on the start date's month and day every `interval` years. 29 February falls on
  28 February in other years.

Rules are evaluated on calendar dates only (`apps/api/src/core/recurrence.js`:
`occursOn`, `occurrencesBetween`, `nextOccurrence`, `previousOccurrence`). Clients ask the
API for occurrences; they do not need their own implementation.

## Habits

### Schedules

- **Fixed** — due on the dates of a recurrence rule.
- **Flexible** — `timesPerPeriod` times per week or month, on any days. No particular day
  is ever due or missed; the obligation belongs to the period.

### Targets

`check` (done once), `count` (a number of repetitions) or `duration` (minutes). A day is
completed when the recorded `value` reaches the target that was in force when the entry was
written.

### State of a day

| State       | Meaning                                 |
| ----------- | --------------------------------------- |
| `completed` | The day's target was reached            |
| `partial`   | Due, today or later, with some progress |
| `pending`   | Due, today or later, no progress yet    |
| `missed`    | Due, in the past, not completed         |
| `skipped`   | Deliberately excused by the user        |
| `postponed` | Moved to another day (`postponedTo`)    |
| `not_due`   | Not scheduled that day                  |

A fixed habit is due on a day when its rule schedules it **or** an earlier occurrence was
postponed to it.

### Streaks

- Fixed schedules: consecutive **due days** that were completed.
- Flexible schedules: consecutive **periods** in which the quota was reached.
- `skipped`, `postponed` and `not_due` days are neutral: they neither extend nor break a
  streak.
- A today (or current period) that is still open does not break the current streak.
- A missed day (or a finished period below its quota) breaks it.
- Streaks are followed back for at most 1100 days.

### Completion rate

`completed ÷ due`, where `due` counts only days (or periods) that could be judged: skipped
and postponed days, and a today that is still open, are left out of both sides. The rate is
`null` when nothing could be judged — there is no such thing as "0% of nothing".
