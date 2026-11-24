# Phase 8 — Analytics and Insights

## Objective

Let the user look back over a week, a month, a quarter or a year and see — in numbers they
can check — how their habits, tasks and goals went, and how that compares with the period
before.

## Implemented

### Analytics (API)

- `GET /analytics/overview?period=week|month|quarter|year&date=YYYY-MM-DD` returns the whole
  calendar period that contains `date` (default: today in the user's time zone):
  - **habits** — due, completed and missed days, the completion rate, the same for the
    previous period, a breakdown by weekday, and every habit of the period in its own unit
    (days for fixed schedules, weeks or months for flexible ones) with its previous rate;
  - **tasks** — finished, due and due-and-done counts, on-time and late completions with
    the on-time rate, tasks without a due date, currently overdue open tasks, the previous
    period's count, and breakdowns by priority and category;
  - **goals** — goals and milestones completed in the period, and each active goal with its
    progress, the progress its elapsed time would predict, its pace (ahead, on track,
    behind) and what moved during the period;
  - **series** — the period step by step for charts: days of a week or month, weeks of a
    quarter, months of a year;
  - **highlights** — up to six observations produced by fixed rules, returned as a kind with
    the numbers behind it.
- A rate is `null`, not `0`, when nothing could be judged.

### Analytics (web)

- New screen "Analiz / Analytics" in the navigation, with a period switcher, previous/next
  navigation and a shortcut back to the current period; period and date live in the URL.
- Four key figures, each with an explanation of how it is calculated and, where meaningful,
  the change against the previous period in words.
- A written **period report** from the highlights; every line can show its rule.
- Three charts (habit completion over time, finished tasks over time, completion by
  weekday) built on a shared `BarSeries` component: one series each, an explanatory
  sentence, exact values on hover, and a table of the same numbers for screen readers.
- A per-habit table, a task breakdown and a goal list with pace.
- **CSV export** of the period's series and a **print layout** (navigation and controls are
  hidden when printing).
- Loading, error-with-retry and empty states.

## Architectural decisions

- **Whole calendar periods, compared with the same kind of period.** "This month against
  last month" is what people mean; rolling windows are harder to name and to verify.
- **Counted on request, nothing stored.** Statistics that are derived at read time cannot
  drift from the records they summarise. The cost is bounded by the period (at most two
  years of days in memory per request); caching is deferred until measurements ask for it.
- **Definitions are part of the contract.** Each figure's meaning is written in the response
  schema, in `docs/architecture/analytics.md` and in the interface itself.
- **No composite score.** Several plain figures with stated rules instead of one number
  nobody can check.
- **Highlights are kinds with parameters, phrased by the client** — the same approach as the
  dashboard insights, so every platform shows the same rules in the user's language.
- **Counts of a running period are never compared**; rates are.
- **One chart form.** Every chart is a single-series bar chart from zero; two measures get
  two charts rather than two axes.

## Problems found and fixed during the phase

- **Archived habits kept "missing" days.** The day totals behind the dashboard's weekly
  figures counted an archived habit as due — and missed — on every day after it was
  archived. An archived habit now ends the day before it was archived. Found while defining
  the analytics figures; covered by a new test.
- **Screen-reader tables made narrow screens scroll sideways.** The visual check at phone
  width showed the page 108 px wider than the screen: a visually hidden `<table>` still
  takes the width of its content. The tables are now wrapped in a hidden element (this also
  affected the dashboard's weekly widget).
- **Tooltips at the right edge of a card** could extend past the page; they can now align
  to the end of their trigger.

## Important files

`apps/api/src/modules/analytics/{analytics.service,analytics-periods,analytics-highlights,analytics.routes}.js`,
`apps/api/src/modules/habits/habits.service.js` (`loadHabitIndexes`),
`packages/shared-contracts/src/analytics.js`,
`apps/web/src/charts/BarSeries.jsx`, `apps/web/src/lib/download.js`,
`apps/web/src/pages/analytics/{AnalyticsPage,sections}.jsx`,
`packages/localization/locales/{tr,en}/analytics.json`,
`docs/architecture/analytics.md`.

## Database changes

None. The endpoint reads existing collections through existing indexes.

## API changes

1 new operation, `GET /analytics/overview` (group Analytics). See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 233 passed (16 files) |
| `@personalitify/web`          | 93 passed (11 files)  |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (14):

- **Periods** (3): the period around a date for each kind and week start; stepping back
  across year ends; steps that cover every day of a period exactly once.
- **Highlights** (6): silence on an empty period; rate comparison only with enough data on
  both sides; most reliable and struggling habit; weekdays only beyond a single week and a
  clear difference; punctuality, task counts of finished periods and the busiest day;
  completed goals and milestones and the limit of six.
- **Overview API** (5): an empty but complete answer for a new account; a month counted from
  real records (missed, skipped and still-open days, a flexible habit in weeks, on-time and
  late tasks finished on different days, categories, goal pace, linked tasks, the previous
  month); week, quarter and year series and request validation; nothing expected of an
  archived habit; the user's week start and isolation between users.

New web tests (8): reaching the screen from the navigation; key figures with comparisons
and explanations and the localized report; each chart's numbers as a table; habits in their
own unit, task breakdowns and goals against time; switching and moving between periods; CSV
export and printing; CSV quoting; empty and failed states.

Also passing: `npm run lint`, `npm run format:check`.

On the local Windows machine one API test worker crashed natively during the final run and
the affected file was rerun successfully (the known issue described in
`docs/development/troubleshooting.md`); CI is the reference.

Manual verification: the seeded demo account (45 days of habit history) was viewed in a
headless browser — month and quarter in the light theme, week in the dark theme, and the
month at phone width, with no console errors or warnings. This is where the sideways scroll
was found; after the fix the page width equals the screen width on both the analytics
screen and the dashboard.

## Build results

`npm run build` succeeded: 1,228.9 kB JavaScript (364.8 kB gzip).

## Known limitations

- The whole application is still one JavaScript bundle; route-level splitting is planned
  for Phase 16.
- Flexible habits appear in the per-habit table only; the totals, series and weekday chart
  cover fixed-schedule habits, because only those have due days.
- Goal pace is a linear yardstick between start and target date, not a forecast.
- Statistics are computed per request without caching.
- The export covers the period's series; a full data export is available from the account
  settings.
- Analytics covers habits, tasks and goals. Focus sessions and mood (Phase 9) get their
  statistics on their own screens.

## Git

| Commit    | Message                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| `7538691` | fix(habits): stop counting days after a habit was archived as missed         |
| `998bc84` | feat(analytics): add period statistics with comparisons and highlights       |
| `8df2a43` | feat(api-client): add analytics.overview                                     |
| `4dc3246` | fix(web): keep screen-reader tables and edge tooltips from widening the page |
| `ea29a1e` | feat(web): add the analytics screen                                          |
| `e83816f` | docs: document analytics and record phase 8                                  |

Push status: pushed to `origin/main` and verified (`origin/main` = `e83816f`).
GitHub Actions: the CI workflow completed successfully for `e83816f` on Node 22 and Node 24.

## Next phase

Phase 9 — Focus, journal and mood.
