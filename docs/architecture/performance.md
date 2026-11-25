# Performance

What was measured, what was changed because of it, and what is known to cost. Numbers are
from one developer machine (Windows 11, Node.js 24, MongoDB on the same machine) and are
meant to show proportions, not to promise absolutes.

## Web client: what is downloaded

The application used to be one JavaScript file. It is now split so that the first visit
downloads the shell and the first screen, and everything else when it is needed
(`apps/web/src/App.jsx`: every routed page is a lazy chunk).

|                                                                    | JavaScript, minified | gzip   |
| ------------------------------------------------------------------ | -------------------- | ------ |
| Before (one bundle)                                                | 1,488 kB             | 440 kB |
| **First load now** (entry and shared application code, five files) | 721 kB               | 231 kB |
| Chart library — when a chart is first shown                        | 414 kB               | 118 kB |
| Journal editor with the Markdown renderer — when it is opened      | 128 kB               | 39 kB  |
| Each other page                                                    | 4–31 kB              | 2–9 kB |

- **Charts.** Only `charts/BarChartView.jsx` imports the chart library, and it is loaded on
  demand. The area a chart is drawn in has its size from the start, so nothing moves when
  the drawing arrives, and the accessible table that carries the same numbers is rendered
  immediately. The dashboard therefore appears without waiting for the chart library.
- **Pages** are fetched when their route is first opened; while one is being fetched the
  application frame stays and only the page area shows a spinner.
- The largest remaining shared chunk holds React, the router, the query library, the
  internationalization library with both languages, the realtime client and the icon set in
  use. Splitting the second language out would save little (the catalogs are small) and
  would make switching language wait for the network.

## API: response times

Measured against the seeded demo account — 4 habits with 45 days of history (138 entries),
8 tasks, 3 goals, 4 calendar events (one repeating on weekdays) — over HTTP on the same
machine, median of ten requests after warm-up:

| Request                                 | Median  | Largest | Body    |
| --------------------------------------- | ------- | ------- | ------- |
| `GET /dashboard`                        | 19.5 ms | 26.0 ms | 16.9 kB |
| `GET /habits/day`                       | 11.3 ms | 14.0 ms | 3.7 kB  |
| `GET /tasks/day`                        | 2.8 ms  | 3.4 ms  | 4.9 kB  |
| `GET /analytics/overview?period=month`  | 14.3 ms | 16.1 ms | 6.5 kB  |
| `GET /analytics/overview?period=year`   | 21.9 ms | 26.9 ms | 4.5 kB  |
| `GET /calendar` (31 days)               | 8.7 ms  | 11.2 ms | 61.2 kB |
| `GET /achievements`                     | 3.9 ms  | 4.3 ms  | 6.7 kB  |
| `GET /notifications?limit=20`           | 2.1 ms  | 2.8 ms  | 1.6 kB  |
| `GET /sync/changes?cursor=0&limit=1000` | 4.6 ms  | 6.0 ms  | 86.5 kB |
| `GET /sync/snapshot/habitEntry`         | 4.2 ms  | 4.8 ms  | 44.7 kB |

This is a small account. The costs that grow are named below; nothing here is a load test,
and no claim is made about many concurrent users.

## Database: indexes

Every query behind a busy screen is checked to be answered from an index: a test
(`hardening.test.js`) asks MongoDB for the plan of eighteen representative queries and fails
if any of them scans a collection.

That test found two that did. The mood entries of a month and the list of a user's
achievements were served by nothing but a **partial unique index** (unique among records
that are not deleted). MongoDB cannot use a partial index for a query on
`deletedAt: null`, because that also matches documents without the field — so both queries
read the whole collection. Each now has an ordinary index
(`{ userId, deletedAt, date }` and `{ userId, deletedAt }`).

The rule this leaves behind: **a partial unique index enforces uniqueness; it does not
serve reads.** A collection that is read by owner needs a plain index that starts with
`userId` as well.

## Known costs

Stated so that they can be recognised when they start to matter:

- **Streaks** are computed by walking a habit's days back up to 1,100 days. This is why
  `/habits/day` is the slowest of the simple requests, and it grows with the number of
  habits (not with the number of users).
- **Analytics** evaluates every habit for every day of the period and the one before it, in
  memory, on every request. A year for a few dozen habits is tens of milliseconds; it is
  not cached.
- **Each change that can earn XP** makes the achievements module run about eight small
  indexed queries. It runs after the response has been produced by the write itself, but in
  the same request.
- **The reminder job** visits every account that has notifications switched on, once a
  minute.
- **Realtime** pushes from the process that handled the write; the web client refetches the
  queries an event makes stale rather than patching them.
- **Responses are not compressed by the API.** The calendar and synchronization answers are
  the large ones (tens of kilobytes of very compressible JSON); compression belongs to the
  reverse proxy in front of the API, which should also serve the web client's static files
  with long cache lifetimes — their names contain a hash of their content.

None of these is a problem at the scale the project is built for: a personal installation,
or a small group sharing one. They are the first places to look when that changes.
