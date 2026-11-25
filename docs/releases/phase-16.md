# Phase 16 — Quality, Security and Performance

## Objective

Go back over the whole product with three questions — is it safe, is it fast enough, can
everyone use it — measure instead of assuming, fix what the measurements show, and write
down honestly what is in place and what is not.

## Implemented

### Performance

- **Code splitting.** Every routed page is a chunk of its own, and the chart library is
  loaded the first time a chart is shown. The first download fell from **440 kB to 231 kB
  gzip** (1,488 kB to 721 kB minified). The chart library (118 kB gzip) and the journal
  editor with its Markdown renderer (39 kB gzip) are fetched only when needed.
- The area of a chart has its size from the start and its accessible table is rendered at
  once, so the dashboard appears without waiting for the chart library and nothing moves
  when the drawing arrives.
- **Indexes.** A new test asks MongoDB for the plan of eighteen representative queries —
  one for every busy screen — and fails if any of them scans a collection.
- **Measured response times** of the heaviest read endpoints for the seeded demo account:
  between 2 and 22 ms median. The numbers, and the costs that are known to grow, are in
  [`docs/architecture/performance.md`](../architecture/performance.md).

### Security

- **Production refuses unsafe settings**: a refresh cookie without `Secure`, web origins
  that are not https, a public URL that is not https. The process does not start.
- **`TRUST_PROXY_HOPS`**: behind reverse proxies the API takes the client's address from
  exactly that many hops, so rate limits and the security log see real clients.
- **New limits**: `POST /sync/push` 30 a minute (each push carries up to 100 operations);
  20 realtime connections per account (the oldest is closed); 30 replay requests per
  connection per 10 seconds.
- **Markdown** is now covered by tests: typed HTML never becomes elements, `javascript:`
  and `data:` links are dropped, images are not loaded.
- A review of every public route, of committed files for secrets, and of dependencies
  (`npm audit`: no known vulnerabilities).
- [`docs/architecture/security.md`](../architecture/security.md) — what is protected, each
  measure with its place in the code and the test that holds it, and the limits — and a
  [`SECURITY.md`](../../SECURITY.md) with how to report a vulnerability.

### Accessibility

- **Automated checks (axe)** over fifteen screens — every main screen signed in, the open
  notification panel, and the sign-in, registration and password forms: names of controls,
  labels, roles, landmarks, heading order, ids.

## Architectural decisions

- **Measure, then change.** The bundle was split because its size was measured; no caching
  was added to the API because its response times were measured too and did not call for it.
- **The chart library is isolated behind one module.** Only `BarChartView.jsx` imports it;
  anything else that imported it would silently pull it back into the first download.
- **Unsafe production configuration is a startup error, not a warning.** A warning in a log
  nobody reads protects nobody.
- **Proxy trust is a number, not a switch.** Trusting `X-Forwarded-For` as a whole lets any
  client choose its own address.
- **Limits state their scope.** They are per process and in memory; the document says so
  instead of implying more.

## Problems found and fixed during the phase

- **Two queries scanned whole collections.** The mood entries of a month and the list of a
  user's achievements were served by nothing but a partial unique index, which MongoDB
  cannot use for a query on `deletedAt: null` (that also matches a missing field). Both now
  have a plain index. Found by the new index test on its first run.
- **Goal cards skipped a heading level** (`h1` straight to `h3`). Found by the new
  accessibility checks.
- **A dashboard test became timing-sensitive** once pages were loaded on demand: under a
  fully parallel run the first render of a page could exceed the test library's one-second
  default wait. The wait is now five seconds for the whole suite; three consecutive full
  runs passed.
- **My own CI polling exhausted GitHub's anonymous API allowance** (60 requests an hour).
  The watcher now asks at most once a minute.

## Important files

`apps/web/src/App.jsx` (lazy routes), `apps/web/src/charts/{BarSeries,BarChartView}.jsx`,
`apps/web/src/test/accessibility.test.jsx`, `apps/web/src/ui/markdown.test.jsx`,
`apps/api/src/config/env.js`, `apps/api/src/middleware/rate-limit.js`,
`apps/api/src/modules/realtime/realtime.server.js`, `apps/api/tests/hardening.test.js`,
`docs/architecture/{security,performance}.md`, `SECURITY.md`.

## Database changes

Two new indexes: `moodEntries { userId, deletedAt, date }` and
`achievements { userId, deletedAt }`.

## API changes

No new operations. `POST /sync/push` is rate-limited separately. New settings
`TRUST_PROXY_HOPS` (default 0); production now requires `COOKIE_SECURE=true` and https
origins.

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 315 passed (26 files) |
| `@personalitify/web`          | 160 passed (20 files) |
| `@personalitify/api-client`   | 28 passed (4 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (5): a safe production configuration accepted; unsafe ones refused with
every problem listed; pushes limited separately from ordinary requests; realtime connections
capped per account and replay requests limited; every busy query answered from an index.

New web tests (20): sixteen accessibility checks; four for Markdown (formatting, no HTML
injection, no dangerous links, no image loading).

Also passing: `npm run lint`, `npm run format:check`.

How the numbers were obtained: the full local gate ran once with every suite passing except
the check that the committed API reference is current (a route description had just been
changed); the reference was regenerated and that test file and the contract tests were run
again and passed. Local API tests were run one file at a time; three runs were repeated
after a native worker crash. CI is the reference for a single clean run.

Manual verification: with the development servers running and the seeded account, the
dashboard, analytics, focus, mood, the journal editor, achievements and the calendar were
each opened directly in a headless browser after the split — every page rendered, the
charts were drawn (7 bars on the dashboard, 33 on the analytics screen), and there were no
console errors or warnings.

## Build results

`npm run build` succeeded. First load: 721 kB JavaScript in five files (231 kB gzip); the
entry file is 292 kB (92 kB gzip).

## Known limitations

- Color contrast is not covered by the automated accessibility checks (the test environment
  has no layout engine); it was checked by hand when the design tokens were made, in both
  themes. No test with real assistive technology or real users has been done.
- The response times are from a small account on one machine; there has been no load test.
- Rate limits are per process and in memory.
- No end-to-end encryption, no second factor, no independent security audit — see the
  "Limits" section of the security document.
- The API does not compress its responses; that is left to the reverse proxy.

## Git

| Commit    | Message                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `16e1bed` | perf(web): load pages and the chart library on demand                                |
| `0d3011b` | fix(api): harden production configuration, add abuse limits and missing indexes      |
| `03cf1d2` | docs: add security and performance documents, a security policy, and record phase 16 |

Push status: pushed to `origin/main` and verified (`origin/main` = `03cf1d2`).
GitHub Actions: run 32 for `03cf1d2` completed successfully (Node 22 and Node 24 jobs).
The result was read from the public Actions page, because the anonymous API allowance was
still used up.

## Next phase

Phase 17 — Final documentation and release.
