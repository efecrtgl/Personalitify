# Phase 9 — Focus, Journal and Mood

## Objective

Add the three personal tools around the planner: a timer for focused work, a private place
to write, and a daily mood record — each usable on its own and each stored in a way that
stays correct across devices.

## Implemented

### Focus timer (API and web)

- Focus sessions and short or long breaks with a planned length, an optional note and
  optional links to a task, habit or goal.
- **Server-timed.** Clients ask to start, pause, resume, finish or abandon; every instant is
  set by the server, and a client cannot send a duration. Paused time does not count.
- **One active session per account**, enforced by a unique index. A second start answers
  `INVALID_STATE` with the id of the session that is active.
- A session that reaches its planned length is **completed by the server** at exactly that
  moment, whether or not a client was open. Finishing and abandoning are idempotent.
- `GET /focus` returns the active session, the user's timer lengths, today's and the last
  seven days' focus time, a suggestion for what comes next, and the server clock.
- History (`GET /focus/sessions`) and day-by-day statistics (`GET /focus/stats`). Only
  completed focus sessions count; breaks and abandoned sessions are kept but add nothing.
- Timer lengths (`focusMinutes`, `shortBreakMinutes`, `longBreakMinutes`, `longBreakEvery`)
  are part of the user's settings.
- Web: a countdown ring that follows the server clock (the difference to the device clock is
  applied), task selection, pause/resume/finish/abandon, the remaining time in the tab
  title, today's focus time, a seven-day chart with a table, recent sessions, and a dialog
  for the lengths.

### Journal and notes (API and web)

- Entries of two kinds — journal (about a day) and note — with a title, a Markdown body, a
  date, up to 12 tags and pinning.
- Lists return a plain-text preview and word count instead of the body. With "hide sensitive
  previews" switched on in the settings, no preview is returned at all.
- **Search** over title, text and tags that ignores case and accents and treats I, İ, ı and
  i as one letter, so it behaves the same in Turkish and English. Every word of the query
  must match; special characters are taken literally.
- Filters by kind, tag, day range and pinned; the tags in use with their counts.
- **Revisions.** Replacing the title or body keeps the previous content; the newest 20 per
  entry are stored and any of them can be restored (the content it replaces becomes a
  revision itself). Revisions are deleted with the entry and are part of the account export.
- Edits carry the version they were based on: changes to different fields merge, changes to
  the same field are refused with `VERSION_CONFLICT`.
- Web: list with search-as-you-type, kind and tag filters, pagination and empty states; an
  editor with write and preview modes, tags, date, pin, history with restore, delete with
  confirmation, a save shortcut, an unsaved-changes indicator and a warning before leaving,
  and a reload with a clear message after a conflict.
- Markdown is rendered without raw HTML and without loading images, so text cannot inject
  markup or cause requests.

### Mood (API and web)

- One entry per calendar day in the user's time zone: a score from 1 to 5, feelings from a
  fixed list and a private note. Recording a day again updates the same entry.
- `GET /mood` returns the entries of a range with their average, the distribution of scores,
  the feelings recorded and the average by weekday.
- Web: a form for today (or any past day chosen in the calendar), a month calendar in which
  each recorded day shows its score as a number and as a shade of one color, month
  navigation, and a summary with distribution, most frequent feelings and a weekday chart
  with a table.

## Architectural decisions

- **The timer is a server record, not client state** — see
  [`docs/architecture/focus-timer.md`](../architecture/focus-timer.md). It is the only way
  the same countdown can be shown on a phone, a browser and the planned desktop client.
- **Uniqueness by index, not by check.** "One active session" and "one mood entry per day"
  are partial unique indexes, so two simultaneous requests cannot both succeed.
- **Search through a folded copy of the text** instead of a MongoDB text index: text indexes
  are tied to one language's stemming and do not match inside words. The copy is scanned
  within one user's entries, bounded by the per-user limit.
- **Revisions are server-side history, not a synchronized entity.** They are read on
  request and never need to be merged.
- **Privacy by shape.** Bodies are returned only by the single-entry endpoint; previews can
  be switched off; journal and mood text is never written to logs.
- **Mood is one value per day**, so that averages mean the same thing for every user;
  several entries per day would make the average depend on how often someone opens the app.
- **Sequential color for mood** (one hue, light to dark) with the score always written next
  to it, so the calendar does not rely on color alone.

## Problems found and fixed during the phase

- **A timer that ran out a moment ago rejected the client's "finished" call**, because the
  server had already completed it. Finishing and abandoning now return the session unchanged
  when it is already in that state.
- **Tags starting with a capital dotted İ** were stored as two code points (JavaScript lower
  -cases `İ` to `i` plus a combining dot), so `#İş` and `#iş` became different tags. Tags
  are folded before lower-casing.
- **Pinning an entry with unsaved text would have discarded the text** (the editor reloads
  the stored entry after any change). Pin and history are available once changes are saved.

## Important files

`apps/api/src/modules/focus/{focus-session.model,focus.service,focus.routes}.js`,
`apps/api/src/modules/journal/{journal-entry.model,journal.service,journal.routes}.js`,
`apps/api/src/modules/mood/{mood-entry.model,mood.service,mood.routes}.js`,
`packages/shared-contracts/src/wellbeing.js`,
`apps/web/src/pages/focus/FocusPage.jsx`,
`apps/web/src/pages/journal/{JournalPage,JournalEditorPage}.jsx`,
`apps/web/src/pages/mood/MoodPage.jsx`, `apps/web/src/ui/Markdown.jsx`,
`packages/localization/locales/{tr,en}/{focus,journal,mood}.json`,
`docs/architecture/focus-timer.md`.

## Database changes

New collections `focusSessions`, `journalEntries`, `journalRevisions` and `moodEntries`
(entity types `focusSession`, `journalEntry`, `moodEntry`); `userSettings` gains `focus`.
Fields, indexes and design notes are in
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

22 new operations: 11 in Focus, 8 in Journal, 3 in Mood. `PATCH /settings` accepts `focus`.
See [`docs/api/openapi.json`](../api/openapi.json).

New dependency in the web client: `react-markdown` (renders Markdown without raw HTML).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 254 passed (19 files) |
| `@personalitify/web`          | 114 passed (14 files) |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (21):

- **Focus** (6): the empty state with defaults and server clock; server-set times, the
  single active session and rejected client times and foreign links; paused time left out,
  including finishing while paused; completion by the server at the planned end and the
  idempotent late report; suggestions, counting only completed focus time, history and
  statistics; links, notes, detaching a deleted task, deletion and isolation between
  accounts.
- **Journal** (10): text folding; Markdown to plain words; creation with tidy tags and
  validation; previews without bodies and hidden previews; search by words ignoring case and
  accents, inside words, in tags, with special characters; filters, pinning and tag counts;
  revisions and restore; the bounded history, export and removal with the entry; merging and
  conflicting edits; isolation between accounts.
- **Mood** (5): one entry per day updated in place; validation of scores, feelings and
  dates; the summary of a range; removing and recording again; isolation and export.

New web tests (21): the timer (clock format, suggested session and start for a task,
countdown against a server clock one hour ahead with pause and resume, reporting the end
once, a session already active elsewhere and abandoning, changing lengths, history and
delete, retry); the journal (list, filters, search-as-you-type, empty and hidden-preview
states, writing with a safe Markdown preview, notes and the save shortcut, versioned edits
and conflict reload, pin, restore and delete, not found); mood (recording today with
required score, an existing entry and removal, summary and chart table, another day and
month navigation, retry).

Also passing: `npm run lint`, `npm run format:check`.

On the local Windows machine API test workers crashed natively during some runs (the known
issue in `docs/development/troubleshooting.md`); affected files were rerun, and the whole
API suite also completed in single runs without a crash. CI is the reference.

Manual verification: with a seeded account plus mood entries, journal entries and a finished
focus session, the timer (idle and running), the mood screen, the journal list, the editor
and its preview were viewed in a headless browser in the light theme, and all three screens
in the dark theme at phone width — no console errors or warnings, no sideways scrolling.

## Build results

`npm run build` succeeded: 1,397.3 kB JavaScript (414.8 kB gzip). The increase comes from
the Markdown renderer and the three screens.

## Known limitations

- The whole application is still one JavaScript bundle; route-level splitting (charts and
  the Markdown renderer on demand) is planned for Phase 16.
- The timer makes no sound and sends no notification when it ends; notifications arrive in
  Phase 11. A timer started on another device appears after a reload until realtime updates
  arrive in Phase 12.
- The journal editor is a plain Markdown text area with a preview, not a rich-text editor,
  and saves on request rather than automatically.
- Images in Markdown are shown as their description only; there are no attachments.
- Journal text is stored as it is written; it is protected by account isolation and
  transport security, not by end-to-end encryption.
- One mood entry per day; several check-ins per day are not supported.

## Git

| Commit    | Message                                                             |
| --------- | ------------------------------------------------------------------- |
| `22d1d79` | feat(focus): add a server-timed focus and break timer               |
| `cc19bf5` | feat(journal): add Markdown entries with tags, search and revisions |
| `e6d6c91` | feat(mood): add a daily mood entry with statistics                  |
| `363cb0e` | feat(api): register focus, journal and mood routes                  |
| `eaecbb2` | feat(api-client): add focus, journal and mood                       |
| `741aa03` | feat(web): add focus timer, journal and mood screens                |
| `d0fe3c9` | docs: document the focus timer and record phase 9                   |

Push status: pushed to `origin/main` and verified (`origin/main` = `d0fe3c9`).
GitHub Actions: the CI workflow completed successfully for `d0fe3c9` on Node 22 and Node 24.

## Next phase

Phase 10 — Achievements and progress system.
