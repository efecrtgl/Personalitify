# Phase 0 — Repository Audit and Technical Planning

## Objective

Establish the current state of the repository and fix the architecture, conventions and
delivery plan that all later phases follow.

## Repository audit

| Check            | Result                                                                    |
| ---------------- | ------------------------------------------------------------------------- |
| Remote           | `origin` → `https://github.com/efecrtgl/Personalitify.git`                |
| Branch           | `main`, tracking `origin/main`                                            |
| Existing commits | `934fb8a` Initial commit · `8ced769` Update README.md                     |
| Existing files   | `LICENSE` (Apache-2.0, preserved unchanged), `README.md` (stub)           |
| Working tree     | Clean before modification                                                 |
| Local toolchain  | Node.js 24.15.0, npm 11.12.1, git 2.54.0                                  |
| MongoDB          | Community Server running as a Windows service on `127.0.0.1:27017`        |
| GitHub CLI       | Not installed; publishing uses plain `git` over HTTPS                     |

## Delivered

- `docs/architecture/overview.md` — multi-client architecture, backend layering, API
  conventions, authentication model, data rules, event/synchronization design, separation of
  data sync from application updates and remote configuration, time-handling rules.
- `docs/architecture/decisions.md` — ADR-001 … ADR-016.
- `docs/roadmap.md` — phase table with status tracking.
- `CONTRIBUTING.md` — bilingual contribution guide and project conventions.
- `CHANGELOG.md`, `.gitignore`.
- `README.md` — bilingual introduction replacing the stub.

## Architectural decisions

The decisions with the widest consequences:

- **Embedded outbox (ADR-004).** Entity change and domain event are one atomic
  single-document write, so reliable events do not depend on replica-set transactions and
  local development works on a default MongoDB installation.
- **Per-user dense sequence cursor (ADR-005)** with a gap-aware reader.
- **UUID identifiers that clients may generate (ADR-006)** for offline creation and idempotent
  retries.
- **Optimistic concurrency with field-level merge (ADR-007).**
- **One auth design for browsers and native clients (ADR-008).**
- **OpenAPI generated from route definitions (ADR-010).**

## Database changes

None (planning phase).

## API changes

None (conventions defined in the overview, §3.1).

## Tests and builds

Not applicable: this phase contains documentation only. No tests were executed and none are
claimed.

## Known limitations

- `overview.md` links to `database.md`, `synchronization.md` and `event-system.md`, which are
  written together with the code they describe (Phases 2, 12 and 13).

## Git

| Commit    | Message                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `cde5d44` | docs(architecture): establish architecture plan, decisions and roadmap   |

Push status: pushed to `origin/main` (`8ced769..cde5d44`) and verified. This report is
published in the commit that follows it.

## Next phase

Phase 1 — Monorepo and development infrastructure.
