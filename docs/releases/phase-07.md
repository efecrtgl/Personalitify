# Phase 7 — Personal Dashboard

## Objective

Replace the placeholder home page with a dashboard that answers "how is today going?" at a
glance, built only from the user's real data, and arranged the way the user wants.

## Implemented

### Dashboard endpoint (API)

- `GET /dashboard` returns everything the home screen needs in one request: today's date in
  the user's time zone, today's habits with their summary, tasks (overdue, due today,
  completed today and counts), upcoming events and planned tasks for today and the next
  seven days, active top-level goals by nearest target date, a seven-day habit summary with
  the previous week's rate for comparison, current streaks, insights and recent activity.
- **Insights** are rules over the user's own numbers, at most four at a time: all habits
  done, overdue tasks, a goal close to its target date, the weekly habit rate rising or
  falling, a streak close to its goal, a long streak, a busy day. A rule stays silent when
  there is not enough data to support it (for example, weeks are compared only when both
  have enough due habits).
- **Recent activity** is read from the event history the platform already records
  (created and completed habits, tasks, goals and events).
- The **widget layout** (order and visibility) is part of the user's settings, so it follows
  the account across devices. A stored layout is completed with widgets added in later
  versions and cleaned of unknown ones.

### Dashboard (web)

- Greeting by time of day in the user's time zone, and ten widgets: today's progress, quick
  actions, today's habits, today's tasks, upcoming, active goals, last seven days, streaks,
  insights and recent activity.
- Habits and tasks can be completed in place; quick actions open the existing task, habit,
  event and goal forms. Every successful change anywhere in the app refreshes the dashboard.
- The seven-day chart explains what its bars mean and ships with a table of the same
  numbers for screen readers. Each insight has an explanation of how it was derived.
- Customise dialog: reorder by dragging or with up/down buttons, hide widgets, restore the
  default layout. Hiding everything leads to an empty state that opens the dialog again.
- Loading skeletons, an error state with retry, and empty states for a new account.

## Architectural decisions

- **One aggregate endpoint instead of ten requests.** The home screen is the most opened
  screen; one round trip keeps it fast on slow connections and gives every client —
  including the future Rust client — the same ready-made view. The endpoint reuses the
  services and response shapes of the modules it summarises; it owns no data.
- **Insights are computed on the server and sent as kinds with parameters, not as text.**
  Clients translate them, so the rules are the same on every platform and the wording
  follows the client's language.
- **No invented numbers.** Every figure is derived from stored records; when there is
  nothing to report, the widget says so.
- **The layout is settings data, not browser storage.** It is versioned and synchronised
  like the rest of the settings.

## Problems found and fixed during the phase

- **The weekly chart could appear empty.** The first full-page capture showed axes without
  bars: the chart restarted its grow-in animation whenever its container was resized. The
  animation was removed; bars are drawn immediately.

## Important files

`apps/api/src/modules/dashboard/{dashboard.service,dashboard-insights,dashboard.routes}.js`,
`apps/api/src/modules/settings/{settings.model,settings.schemas}.js`,
`packages/shared-contracts/src/preferences.js` (`DASHBOARD_WIDGETS`),
`apps/web/src/pages/dashboard/{DashboardPage,widgets,CustomizeDialog}.jsx`,
`packages/localization/locales/{tr,en}/dashboard.json`.

Removed: the placeholder `apps/web/src/pages/HomePage.jsx` and its `home` locale files.

## Database changes

No new collection. `settings` gains `dashboard.widgets` (ordered list of `{ id, visible }`).
See [`docs/architecture/database.md`](../architecture/database.md).

## API changes

1 new operation, `GET /dashboard` (group Dashboard). `PATCH /settings` accepts
`dashboard.widgets`. See [`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 219 passed (15 files) |
| `@personalitify/web`          | 85 passed (10 files)  |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (11):

- **Insights** (6): silence without data; all habits done, ignoring excused ones; week
  comparison only with enough data on both sides; overdue tasks, a goal near its date and a
  busy day; a streak near its goal and a long streak; the limit of four.
- **Dashboard API** (5): an empty but complete answer for a new account; aggregation of real
  data from every module; completions in recent activity with the habit's name; the layout
  stored in the account and completed with new widgets; isolation between users.

New web tests (7): greeting and real figures from every module; empty states for a new
account; completing a habit in place and refreshing the figures; adding a task through a
quick action; following the stored layout; rearranging, hiding and restoring widgets and
saving the layout; retry after a failed load.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification: an account with 45 days of habit history, goals, tasks and events was
seeded through the public API, and the dashboard (light, dark, mobile width) and the
customise dialog were captured in a headless browser, with no console errors or warnings.
This is where the empty chart was found.

## Build results

`npm run build` succeeded: 1,151.2 kB JavaScript (345.6 kB gzip). The increase over Phase 6
comes from the chart library, which is now loaded with the first screen.

## Known limitations

- The whole application is still one JavaScript bundle; splitting it by route (and loading
  charts on demand) is planned for Phase 16.
- Widgets have fixed sizes; they can be reordered and hidden, not resized.
- The dashboard refreshes after changes made in the same browser tab. Changes from other
  devices appear on the next load until realtime updates arrive in Phase 12.
- Insights are rule-based summaries of the last two weeks; deeper analysis is Phase 8.

## Git

| Commit    | Message                                                         |
| --------- | --------------------------------------------------------------- |
| `a0535e5` | feat(dashboard): add the personal dashboard endpoint            |
| `bf1895a` | feat(api-client): add dashboard.get                             |
| `14508ee` | feat(web): replace the placeholder home page with the dashboard |
| `18c8b68` | docs: record phase 7 in changelog and roadmap                   |

Push status: pushed to `origin/main` and verified (`origin/main` = `18c8b68`).
GitHub Actions: the CI workflow completed successfully for `18c8b68` on Node 22 and Node 24.

## Next phase

Phase 8 — Analytics and insights.
