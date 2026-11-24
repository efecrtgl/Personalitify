# Phase 10 — Achievements and Progress System

## Objective

Reward the user for what they actually record — with experience points, levels and
achievements — by rules that are published, cannot be gamed by repeating an action, and
cannot be set by a client.

## Implemented

### Progress system (API)

- **XP rules**, fixed and published: a completed habit day 10 · a finished task 5, high
  priority 10 · a milestone 15 · a completed goal 50 · 2 per full five minutes of a
  completed focus session (at most 24 per session) · writing in the journal 5 once a day ·
  recording the mood of a day 2 once per day.
- **Levels**: level _n_ starts at `50 · n · (n − 1)` XP (0, 100, 300, 600, 1000, …).
- **21 achievements** in seven groups (habits, tasks, goals, focus, journal, mood, level),
  each a figure and a target. Unlocked achievements are synchronized entities, so an unlock
  reaches every device as an event.
- `GET /achievements`: total XP, today's and the last seven days' XP, the level with the
  distance to the next, every achievement with its current figure, and the latest 20 grants.
- There is no write endpoint: neither XP nor achievements can be granted by a client.
- Grants are part of the account export and are erased with the account.

### Achievements (web)

- New screen "Başarılar / Achievements": level card with a progress bar and the XP of today
  and the last seven days; achievements by group, each unlocked (with its date) or locked
  (with a progress bar and "current / target"); the XP rules with their real amounts, read
  from the same constants the server uses; the latest XP earned.

## Architectural decisions

- **A ledger, not a counter.** XP is one row per thing that earned it, with a key that
  names the thing and is unique per user. The total is the sum. This makes grants idempotent
  under at-least-once event delivery, makes undo a row deletion, and means the total can
  always be recomputed. See [`docs/architecture/achievements.md`](../architecture/achievements.md).
- **The rows a record should have are a pure function of its current state.** After every
  change the ledger is brought in line with that function, so completing, undoing and
  completing again ends with exactly one grant.
- **Event subscribers, no coupling.** The module listens to the events other modules
  already emit; none of them knows the progress system exists.
- **Deleting keeps, undoing takes back.** Deleting an old finished task does not cost XP;
  reopening it does. Clearing a habit day counts as undoing.
- **Achievements are never taken back**, and the longest streak is remembered separately so
  that it survives the deletion of the habit.
- **Older accounts are counted once on first use**, so the feature starts with the XP a
  user's history earned instead of zero.
- **Journal XP belongs to the day of writing**, not the day the entry is about, so
  backdating entries earns nothing.
- **No social mechanics**: no leaderboards and no comparison with others.

## Problems found and fixed during the phase

- **Polling with the test runner's `waitFor` moved the frozen clock.** With a faked `Date`,
  it advances time by its polling interval, which silently shortened a ten-minute focus
  session below two full blocks. The tests now poll without touching the clock; the product
  code was right.

## Important files

`packages/shared-contracts/src/progress.js` (rules, levels, achievement definitions),
`apps/api/src/modules/achievements/{progress.model,achievements.service,achievements.routes}.js`,
`apps/web/src/pages/achievements/AchievementsPage.jsx`,
`packages/localization/locales/{tr,en}/achievements.json`,
`docs/architecture/achievements.md`.

## Database changes

New collections `xpGrants` (the ledger), `userProgress` (longest streak, backfill marker)
and `achievements` (entity type `achievement`). See
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

1 new operation, `GET /achievements` (group Achievements). See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 264 passed (20 files) |
| `@personalitify/web`          | 118 passed (15 files) |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (10):

- **Rules** (3): level thresholds and progress; focus XP in whole blocks with a cap; the
  grants of each record type derived from its state, including dates in the user's zone.
- **Progress API** (7): a new account at level one; a habit day granted once, taken back
  when it drops below target or is cleared, with the achievement kept; tasks, goals,
  milestones, focus, journal and mood by their rules, including reopen, delete, once-per-day
  limits, breaks and abandoned sessions, and crossing into level two; the longest streak
  kept after its habit is deleted; the same result when an event is handled again, with the
  unlock announced once; counting records that predate the progress record; no client
  grants, isolation between accounts and the export.

New web tests (4): level and XP figures; every achievement by group with state and
progress, focus time in hours; the rules with real amounts and the recent list; the empty
state and retry.

Also passing: `npm run lint`, `npm run format:check`. The final local run completed without
a native worker crash.

Manual verification: the seeded demo account (45 days of history) was opened in a headless
browser. Its history was counted on first use — 1,432 XP, level 5, six achievements — and
the screen was checked in the light theme and, at phone width, in the dark theme, with no
console errors and no sideways scrolling. During this check the development API process
stopped once without an error message; started directly it ran the same requests without a
problem, which matches the native process crashes already documented for this machine.

## Build results

`npm run build` succeeded: 1,412.8 kB JavaScript (418.6 kB gzip).

## Known limitations

- An unlock is shown the next time the screen is opened; a notification follows in Phase 11
  and live delivery in Phase 12.
- Figures are recomputed on every relevant event and on every visit (a handful of indexed
  queries); caching is revisited in Phase 16 if measurements call for it.
- The longest streak counts day streaks of fixed-schedule habits; flexible habits (weekly
  or monthly quotas) do not contribute to streak achievements.
- The set of achievements is fixed in code; there are no user-defined achievements.
- The one-time count of older records runs inside the first request that needs it.

## Git

| Commit    | Message                                                |
| --------- | ------------------------------------------------------ |
| `cdd96ab` | feat(achievements): add XP, levels and achievements    |
| `dc982e1` | feat(api-client): add achievements.get                 |
| `38d556b` | feat(web): add the achievements screen                 |
| `f38b856` | docs: document the progress system and record phase 10 |

Push status: pushed to `origin/main` and verified (`origin/main` = `f38b856`).
GitHub Actions: the CI workflow completed successfully for `f38b856` on Node 22 and Node 24.

## Next phase

Phase 11 — Notifications and background jobs.
