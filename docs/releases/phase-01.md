# Phase 1 — Monorepo and Development Infrastructure

## Objective

Create the monorepo and everything needed to develop, test and verify the project with one
command, on a machine that has only Node.js and MongoDB Community Server.

## Implemented

- **npm workspaces monorepo**: `apps/api`, `apps/web`, `packages/localization`,
  `packages/shared-contracts`, plus a placeholder README in `apps/desktop`.
- **API bootstrap** (`apps/api`)
  - Environment schema (zod) validated before any other module loads; invalid configuration
    stops the process with a list of the offending variables.
  - Structured logging with pino, pretty output in development, silent in tests, redaction
    of tokens, passwords, cookies and authorization headers.
  - MongoDB connection management. If the server is unreachable the process prints
    step-by-step instructions and exits; there is no fallback database.
  - `GET /api/v1/health` (liveness) and `GET /api/v1/health/ready` (readiness, 503 when the
    database is down).
  - Graceful shutdown, readable "port in use" error.
- **Web bootstrap** (`apps/web`): React 19, Vite 8, Tailwind CSS 4. The dev server proxies
  `/api` and `/socket.io` to the API. A connectivity shell calls the real health endpoint.
- **Shared packages**
  - `shared-contracts`: API prefix/version, application ids, client types, platforms, stable
    error codes.
  - `localization`: Turkish and English catalogs, `resolveLanguage` for `Accept-Language`
    negotiation, and a test that fails when languages diverge in keys or placeholders.
- **Tooling**: ESLint 10 (flat config), Prettier, EditorConfig, LF line endings.
- **One-command development**: `npm run dev` creates `.env` with a generated secret on first
  run, then starts API and web together.
- **CI**: GitHub Actions workflow running lint, format check, tests and build on Node 22 and
  24 with a MongoDB service container. No secrets required.
- **Documentation**: bilingual setup and troubleshooting guides, README quick start.

## Architectural decisions

- Environment values come from the process environment first and the root `.env` second, so
  CI and tests can override without files.
- Each Vitest worker uses its own MongoDB database (`personalitify_test_<n>`), which allows
  test files to run in parallel against one server and keeps the development database
  untouched.
- The Express application is built by a factory (`createApp`) with no side effects, so tests
  drive it in-process.

## Database changes

None. The development database `personalitify` is created on first connection.

## API changes

| Method | Path                   | Description |
| ------ | ---------------------- | ----------- |
| GET    | `/api/v1/health`       | Liveness    |
| GET    | `/api/v1/health/ready` | Readiness   |

## Tests executed

| Suite                         | Result             |
| ----------------------------- | ------------------ |
| `@personalitify/api`          | 9 passed (2 files) |
| `@personalitify/web`          | 2 passed (1 file)  |
| `@personalitify/localization` | 5 passed (1 file)  |

Also run and passing: `npm run lint`, `npm run format:check`.

Manual verification on Windows 11, Node 24.15, MongoDB Community Server:

- `npm run dev` started both processes; `GET http://localhost:5173/api/v1/health` (through
  the Vite proxy) and `GET http://127.0.0.1:4000/api/v1/health/ready` both answered 200.
- With `MONGODB_URI` pointed at a closed port the API printed the MongoDB instructions and
  exited with code 1.

## Build results

`npm run build` succeeded (web bundle: 222.6 kB JS / 70.0 kB gzip, 6.9 kB CSS).

## Known limitations

- The web client is an infrastructure shell; the application UI arrives in Phase 3.
- Security middleware (headers, CORS, rate limiting) is part of Phase 2.

## Git

| Commit    | Message                                                           |
| --------- | ----------------------------------------------------------------- |
| `3d62b91` | build: set up npm workspaces monorepo and shared tooling          |
| `4d5af4e` | feat(contracts): add shared contracts and localization packages   |
| `79e4a3e` | feat(api): bootstrap Express backend with validated configuration |
| `b19539b` | feat(web): scaffold React, Vite and Tailwind client               |
| `1f5fe3f` | ci: add lint, test and build workflow                             |
| `10a8d26` | docs(development): add setup and troubleshooting guides           |

Push status: pushed to `origin/main` and verified (`origin/main` = `10a8d26`).
GitHub Actions: the CI workflow completed successfully for `10a8d26` on Node 22 and Node 24.

## Next phase

Phase 2 — Backend core and security.
