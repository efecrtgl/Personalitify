# Phase 15 — API SDK and Rust Client Compatibility

## Objective

Make the backend's contracts complete and precise enough that a client in another language —
the planned Rust desktop client — can be written from the documents alone, and prove with
tests that the documents describe what the server really does. The Rust client itself is not
part of this phase and has not been written.

## Implemented

### JSON Schemas

- 21 standalone JSON Schema documents (draft 2020-12) in `docs/api/schemas/`: one for each
  of the 13 synchronized entity types, plus the error envelope, the event, the deletion
  tombstone, a synchronization change, the token set, the user and the device, and an index
  that maps entity types to their files.
- They are **generated from the same schemas the API checks its own answers against**
  (`npm run docs:api` now writes them next to the OpenAPI document), and a test fails when
  the committed files fall behind the code.

### API client (SDK)

- The JavaScript client now reaches **every operation of the API**. A coverage test calls
  every method of the client, records what it requests and compares that with the generated
  API reference in both directions: nothing in the API is unreachable, and the client calls
  nothing that does not exist. (It found one gap, `GET /health/ready`, now closed.)
- A README for the package: creating a client, token stores for browsers and native
  clients, errors, realtime and synchronization.

### Contract tests

`apps/api/tests/contracts.test.js` uses the API the way a native client would — no cookies,
tokens held by the client, everything through the published client package against a real
server:

- sign-in with the refresh token in the body, **refresh with rotation** after the access
  token is lost, sign-out, and sign-in again;
- one record of **every entity type** created through the client, then every entity in a
  synchronization snapshot **and the `data` of every event** validated against the
  published schema of its type;
- following the account live from a second device, going offline, and catching up with
  push and pull;
- the update check, the configuration and both health endpoints before anyone signs in.

### Integration guide

- [`docs/architecture/rust-client-compatibility.md`](../architecture/rust-client-compatibility.md):
  sources of truth, wire conventions and data formats with suggested Rust types, identity
  and sessions for a native client (installation id, credential store, single-use refresh
  tokens), the data model, writing with `baseVersion`, realtime and synchronization, the
  timer, updates and configuration, notifications, localization, suggested crates, a
  ten-step checklist, and the tests that prove each part.
- `apps/desktop/README.md` now points to everything the client needs.
- `docs/api/overview.md` names the two reference documents and how they are kept in step.

## Architectural decisions

- **One definition, three artifacts.** The zod schema of an entity validates responses at
  run time, produces the OpenAPI document, and produces the JSON Schema. A client's types
  cannot disagree with the server's answers without a test failing here.
- **An entity has one shape everywhere** — REST answer, snapshot, change, event. This was
  true by construction; it is now stated, published and tested, because it is what lets a
  client have one type per entity.
- **Coverage is tested against the generated reference**, not against a hand-kept list, so
  a new endpoint without a client method fails the build.
- **The JavaScript client is the reference implementation**, small and dependency-light on
  purpose: the sequencer and the replica are meant to be read and ported.
- **The Rust snippets in the guide are sketches** and are labelled as such; no Rust code is
  compiled in this repository, and nothing pretends otherwise.

## Problems found and fixed during the phase

- **One API operation had no client method** (`GET /health/ready`); found by the new
  coverage test.
- **The realtime server's shutdown closes the HTTP server beneath it.** A contract test that
  closed it mid-file took the shared test server away from the tests after it; it is now
  attached and closed once per file.

## Important files

`apps/api/src/core/json-schemas.js`, `apps/api/scripts/generate-openapi.js`,
`docs/api/schemas/**`, `apps/api/tests/contracts.test.js`,
`packages/api-client/tests/coverage.test.js`, `packages/api-client/README.md`,
`docs/architecture/rust-client-compatibility.md`, `apps/desktop/README.md`.

## Database changes

None.

## API changes

No new operations. An `achievement` now has a published schema like every other entity.

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 310 passed (25 files) |
| `@personalitify/web`          | 140 passed (18 files) |
| `@personalitify/api-client`   | 28 passed (4 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (6): published schemas in step with the code; a schema for every
synchronized entity type, each a standalone document with the four fields synchronization
relies on; a native sign-in with refresh rotation and sign-out; real data of every entity
type and of every event in the published shapes; live follow and offline catch-up; updates,
configuration and health without sign-in.

New client test (1): the client reaches every operation of the API and nothing else.

Also passing: `npm run lint`, `npm run format:check`. Local API tests were run one file at a
time; three runs were repeated after a native worker crash (see
`docs/development/troubleshooting.md`).

No manual verification was needed: this phase changed no user-visible behaviour.

## Build results

`npm run build` succeeded: 1,487.7 kB JavaScript (440.5 kB gzip), unchanged.

## Known limitations

- No Rust client exists. The guide's Rust code is illustrative and has not been compiled.
- The JSON Schemas describe response shapes. Request bodies are described in the OpenAPI
  document only.
- Date and time fields are typed as strings in the schemas; their formats are given in the
  guide and the API overview rather than as `format` annotations.
- The JavaScript client is not published to a package registry; it is consumed from this
  repository.

## Git

| Commit    | Message                                                                     |
| --------- | --------------------------------------------------------------------------- |
| `ed87e94` | feat(api): publish JSON Schemas, complete the client and add contract tests |
| `bb1d09b` | docs: add the client README and Rust integration pointers, record phase 15  |

Push status: pushed to `origin/main` and verified (`origin/main` = `bb1d09b`).
GitHub Actions: the CI workflow completed successfully for `bb1d09b` on Node 22 and Node 24.

## Next phase

Phase 16 — Quality, security and performance.
