# Achievements and progress

Experience points (XP), levels and achievements. Code: `apps/api/src/modules/achievements`;
rules and definitions: `packages/shared-contracts/src/progress.js`. Endpoint:
`GET /api/v1/achievements`.

The system has one promise: **a number the user can check**. XP comes only from things the
user recorded, by rules that are published in the API description and shown on the screen.

## XP rules

| Rule                  | XP                                           | Granted for                                   |
| --------------------- | -------------------------------------------- | --------------------------------------------- |
| `habit_completed`     | 10                                           | a habit day whose target was reached          |
| `task_completed`      | 5                                            | a finished task                               |
| `task_completed_high` | 10                                           | a finished high-priority task (instead of 5)  |
| `milestone_completed` | 15                                           | a milestone marked as done                    |
| `goal_completed`      | 50                                           | a goal marked as completed                    |
| `focus_block`         | 2 per full 5 minutes, at most 24 per session | a completed focus session (not breaks)        |
| `journal_written`     | 5                                            | writing in the journal, once per calendar day |
| `mood_recorded`       | 2                                            | recording the mood of a day, once per day     |

Levels: level _n_ starts at `50 · n · (n − 1)` XP — 0, 100, 300, 600, 1000, … Each level
needs 100 XP more than the one before.

## The ledger

XP is not a counter that is incremented. It is a **ledger** (`xpGrants`): one row per thing
that earned XP, with a `key` that names the thing — `task:<id>`, `habit:<entryId>`,
`milestone:<goalId>:<milestoneId>`, `focus:<sessionId>`, `journal:<date>`, `mood:<date>` —
unique per user. The total is the sum of the rows.

That shape gives three properties for free:

- **Idempotent grants.** The event bus delivers at least once; handling the same event again
  writes the same row again. Nothing is ever counted twice.
- **Undo.** The rows a record should have are a pure function of the record's current state
  (`desiredGrants`). After every change the ledger is brought in line with it: a reopened
  task, an unticked milestone or a cleared habit day loses its row, and gets it back when
  done again. Toggling earns nothing.
- **No drift.** The total can always be recomputed from the rows, and the rows from the
  records.

Deleting a record keeps the XP it earned — tidying up old tasks costs nothing. The one
exception is a habit day: clearing it _is_ undoing the completion. Journal and mood XP is
per day and is not taken back.

## How grants happen

The module subscribes to the events of habit entries, tasks, goals, focus sessions, journal
entries and mood entries. For each event it loads the record, reconciles its ledger rows,
updates the longest habit streak it has seen, and unlocks every achievement whose figure has
been reached. No other module knows the progress system exists, and a client cannot grant
anything: there is no write endpoint.

The first time an account is touched by the progress system — its first event, or its first
visit to the screen — everything it recorded before is counted once (`backfilledAt`), so
accounts older than the feature start with the XP their history earned.

## Achievements

An achievement is a figure and a target (`ACHIEVEMENTS`): completed habit days, the longest
streak, finished tasks, milestones, goals, focus sessions and focus time, journal entries,
mood entries, and the level. When the figure reaches the target, an `achievement` record is
created — a synchronized entity, so the unlock reaches every device as an
`achievement.created` event (and, from Phase 11, a notification).

- **Reached once is reached for good.** Achievements are never removed, even if the figure
  falls later (a habit is deleted, a task reopened).
- Unlocking is protected by a unique index on user and key; concurrent handlers cannot
  create it twice.
- The longest streak is remembered separately (`userProgress.bestStreak`, only ever raised),
  so it survives the deletion of the habit it was earned with. It counts day streaks of
  fixed-schedule habits.

## Response

`GET /achievements` returns the total XP, today's and the last seven days' XP, the level
with the distance to the next one, every achievement with its current figure (never more
than the target), and the latest twenty ledger rows.

## What it deliberately is not

No leaderboards, no comparison with other users, no streak-freeze purchases, no XP for
merely opening the app. The system rewards the user's own records and nothing else.
