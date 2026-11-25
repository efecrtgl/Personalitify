# Phase 17 — Final Documentation and Release

## Objective

Make the repository understandable and usable by someone who has never seen it: a complete
README in Turkish and English with real screenshots, an index of every document, a
troubleshooting guide that covers what the later phases added — and prove from a fresh clone
that the documented steps work. Then mark version 0.1.0.

## Implemented

- **`README.md` (Turkish, the default) and `README.en.md`**: what the product is, a feature
  table, screenshots, quick start, scripts, the structure of the repository, links to the
  documents, and a section that states plainly what does not exist yet.
- **Twelve screenshots** in `docs/screenshots/`: dashboard (light, dark, phone), habits,
  tasks, goals, calendar, analytics, focus, journal, mood and achievements. They are
  captures of the running application in a headless browser, with a sample account that was
  created through the application's public API and deleted afterwards. Nothing in them is
  drawn or edited.
- **`docs/README.md`**: an index of all documents with one line about each.
- **Troubleshooting** (English and Turkish), five new entries: emails that do not arrive
  without SMTP, "Unsafe production configuration", HTTP 429 and the actual limits, shared
  rate limits behind a reverse proxy (`TRUST_PROXY_HOPS`), and the administration section.
- **`CHANGELOG.md`**: the entries so far are now the `0.1.0` section, dated 2026-11-25.
- **Tag `v0.1.0`** on the final commit of this phase.

## Decisions

- **Two README files instead of one bilingual file.** Each is complete in its language and
  links to the other; the Turkish one is the default GitHub shows.
- **The limits are in the README, not only in the reports.** Someone deciding whether to use
  the project should not have to read eighteen reports to learn that there is no desktop
  client and no offline web mode.
- **A neutral name in the screenshots.** The first set of captures used a real person's name
  for the sample account; they were taken again with an invented one before anything was
  committed.
- **A tag, not a GitHub Release.** Creating a Release object needs an authenticated API
  call; this environment has only Git access. The tag is pushed; a Release can be created
  from it on the website in a few clicks.

## Verification from a fresh clone

The repository was cloned into an empty directory (at commit `11f684c`) and the documented
steps were followed there, with nothing copied from the working directory:

| Step                   | Result                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `npm ci`               | installed, 0 vulnerabilities reported                               |
| `npm run lint`         | passed                                                              |
| `npm run format:check` | passed                                                              |
| `npm run build`        | succeeded                                                           |
| `npm run dev`          | created `.env` with a generated secret; API and web client started  |
| `GET /health/ready`    | `status: ready`, `database: up`                                     |
| Web client             | `http://localhost:5173/` answered 200 and proxied `/api` to the API |
| API reference          | `/api/v1/docs` answered 200                                         |
| `npm run test`         | see below                                                           |

## Tests executed

In the fresh clone:

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 315 passed (26 files) |
| `@personalitify/web`          | 160 passed (20 files) |
| `@personalitify/api-client`   | 28 passed (4 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

How the backend number was obtained: the single `npm run test` run reported 291 of 315
passed in 23 of 26 files; the other three files (`tasks`, `realtime`, `account`) were
interrupted by the native worker crash described in the troubleshooting guide (exit code
3221226505), with no failed assertion. Those three files were then run on their own and
passed completely (20, 8 and 8 tests). On this machine a single uninterrupted run of the
backend suite was not obtained in this phase; CI is the reference for that.

Also checked: all 239 relative links and images in the 45 Markdown files of the repository
point at existing files.

No application code changed in this phase.

## Build results

`npm run build` succeeded in the fresh clone; the output is the same as in Phase 16 (entry
file 292 kB, 93 kB gzip).

## Known limitations

These are the limits of the release as a whole; the README lists them too.

- No desktop (Rust) or mobile client exists. The contracts for them are documented and
  tested; the applications are not written.
- The web client does not work offline; it does not use the sync protocol with a local
  store.
- No push notifications; email only for account actions and only with SMTP configured.
- The update check informs; nothing downloads or installs an update.
- Rate limits and realtime connection limits are per process.
- No end-to-end encryption, no second factor, no load test, no independent security audit,
  no test with real assistive technology.
- The private reporting path in `SECURITY.md` works only once the repository owner enables
  "Private vulnerability reporting" in the repository settings.
- No GitHub Release object was created (see Decisions).
- The interface texts were written, not reviewed by a second Turkish or English reader.

## Git

| Commit    | Message                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| `f3d9e7c` | docs: add full Turkish and English READMEs with screenshots                          |
| `11f684c` | docs: add a documentation index, extend troubleshooting and open the 0.1.0 changelog |
| `9f3af7c` | docs(releases): add phase 16 report                                                  |

Push status: pushed to `origin/main` and verified (`origin/main` = `9f3af7c`).
GitHub Actions: run 33 for `9f3af7c` completed successfully (read from the public Actions page).

This report and the roadmap update are committed after it; the tag `v0.1.0` points at that
commit.

## Next

The eighteen planned phases are complete. What comes after the release is listed at the end
of the [roadmap](../roadmap.md): the Rust desktop client, native push providers and further
languages.
