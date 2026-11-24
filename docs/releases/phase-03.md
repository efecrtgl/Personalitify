# Phase 3 — Frontend Foundation and Design System

## Objective

Give the product a real, usable web client: a design system, the application frame, both
languages and themes, and working screens for everything the backend offered after Phase 2.

## Implemented

### API client SDK (`packages/api-client`)

- `createApiClient` — framework-free, works with any `fetch` and any token store.
- Bearer authentication, `Accept-Language`, query serialization, the `{ data, meta }`
  envelope, and `ApiError` with stable codes and per-field messages.
- Token refresh: ahead of expiry and after `TOKEN_EXPIRED`, shared by concurrent requests
  (refresh tokens are single-use), with a hook to serialize it across execution contexts.
- Reports the end of a session exactly once; transient refresh failures keep the session.

### Design system (`apps/web/src/ui`, `index.css`)

- Tokens for surfaces, lines, text, accent, status colors, radius, shadows, type scale and
  motion, defined once for light and once for dark.
- Components: `Button`, `IconButton`, `LinkButton`, `Field`, `Input`, `Textarea`,
  `PasswordInput`, `Select`, `Switch`, `SegmentedControl`, `Modal`, `ConfirmDialog`, `Menu`,
  `Tooltip`, toasts, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `Banner`, `Card`,
  `Panel`, `PageHeader`, `Avatar`, `Badge`, `Row`.
- Accessibility: native `<dialog>` for modals and the drawer, labelled and described form
  controls, announced errors, menu-button keyboard pattern, one focus indicator, skip link,
  focus moved to the page after navigation, reduced-motion support.

### Application

- Responsive shell: sidebar on wide screens, modal drawer on narrow ones, sticky top bar
  with the date in the user's time zone, theme menu and account menu.
- Session restore from the refresh cookie on start, with cross-tab refresh locking.
- Themes: system, light, dark; applied before first paint; stored locally and in the
  account.
- Languages: Turkish (default) and English; switchable before and after sign-in; stored
  locally and in the account; dates, times and relative times follow the user's language,
  time zone, clock and date order.
- Screens: sign in, register, forgot password, reset password, verify email, home, not
  found.
- Settings: profile (name, bio, avatar color), appearance (theme, language), date and time
  (time zone with detection, date format, clock, first day of week, live examples),
  notifications (channels, quiet hours), privacy (sensitive previews, data export download),
  security (email status, password change, sessions with revoke, sign out everywhere,
  security activity with pagination), devices (rename, remove), account deletion with
  password confirmation.
- Optimistic, versioned updates with rollback; conflicts with another device reload the
  server state and explain what happened.
- Every list has loading, empty and error states.

## Architectural decisions

- The web client reaches the backend only through the SDK; nothing in the SDK depends on
  React or the DOM, so the same package serves other JavaScript clients.
- The signed-in user is a single query-cache entry. Mutations of one resource are serialized
  so each request carries the version returned by the previous one.
- Navigation is data (`layout/navigation.js`); a module registers its entry when it ships.
- Simple choices use native `<select>` and radio inputs rather than custom widgets, for
  keyboard, screen reader and mobile behaviour.

## Problems found and fixed during the phase

- **Session restore was rate limited like a login.** `/auth/refresh` shared the 10/min limit
  of the credential endpoints; about ten page reloads in a minute answered 429 and the app
  showed a connection error. Found while capturing screenshots of the running application.
  It now has its own limit (60/min), covered by a test, and the start screen shows the
  server's actual message instead of assuming the network is down.
- **The API client captured `fetch` at import time**, so a replaced global `fetch` was never
  used. The web client now resolves it per call.
- **A button nested inside a link** (invalid HTML) in two places; replaced by `LinkButton`.
- Dark-theme danger buttons had weak text contrast; Edge drew its own password-reveal icon
  next to ours; the inline banner wrapped badly on phones. All corrected.

## Important files

`packages/api-client/src/{index,http,errors,token-store}.js`,
`apps/web/src/{App.jsx,index.css}`, `apps/web/src/ui/*`, `apps/web/src/layout/*`,
`apps/web/src/providers/{AuthProvider,ThemeProvider}.jsx`,
`apps/web/src/hooks/{useAccount,useForm}.js`, `apps/web/src/lib/*`,
`apps/web/src/pages/auth/*`, `apps/web/src/pages/settings/*`,
`packages/localization/locales/{tr,en}/{common,auth,home,settings}.json`,
`docs/architecture/frontend.md`.

## Database changes

None.

## API changes

- `POST /auth/refresh` uses a separate rate limit. No contract change.

## Tests executed

| Suite                         | Result              |
| ----------------------------- | ------------------- |
| `@personalitify/api`          | 85 passed (8 files) |
| `@personalitify/web`          | 44 passed (5 files) |
| `@personalitify/api-client`   | 15 passed (1 file)  |
| `@personalitify/localization` | 5 passed (1 file)   |

Web coverage:

- **Application flows** (14): redirect of visitors, Turkish default, language switch and
  persistence, client-side and server-side validation messages, sign-in with web device
  registration, registration, session restore, unreachable server and retry, revoked
  session, sign-out, not-found page, theme following the system, theme persistence, theme
  stored in and restored from the account.
- **Settings** (7): section navigation, profile save with base version, server field
  errors, optimistic update with rollback and version chaining, conflict reload, device
  rename and removal, account deletion with password.
- **UI components** (13): button states, field wiring, switch, segmented control, modal,
  confirm dialog, menu keyboard behaviour, toasts, avatar contrast.
- **Formatting** (6): time zone, date order, 12/24-hour clock, localized long dates,
  relative time, greeting by local hour.
- **Translations** (4): every translation key used in the source has a Turkish and an
  English message; no hardcoded sentences in JSX.

SDK coverage (15): request shaping, public endpoints, pagination, error mapping, network
and invalid-response errors, refresh-and-retry, single-flight refresh, proactive refresh,
cookie mode, session end, transient refresh failure, refresh lock, token storage.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification: the running application was driven in a headless browser (Edge) —
registration, home, every settings section, dark theme, a 390 px wide viewport with the
drawer, and account deletion — with no console errors or warnings.

### Note on local test runs (Windows)

During this phase the backend suite intermittently ended with
`Worker exited unexpectedly with exit code 3221226505` on the development machine: a native
crash of a test worker process, in a different test file each time, in about one run out of
five. No assertion ever failed. The following were measured and ruled out as causes: fork
versus thread pools, file parallelism, the V8 compile cache, password hashing, HTTP server
churn, running development servers and source edits. Inspecting a worker showed a
third-party DLL (`windhawk.dll`) injected into `node.exe`; that is the likely cause but it
was not confirmed, because confirming it means changing that tool's configuration. Clean
runs are the reported results above, and the GitHub Actions run is the reference.
See the troubleshooting guide.

## Build results

`npm run build` succeeded: 599.4 kB JavaScript (189.1 kB gzip), 30 kB CSS (6.7 kB gzip).

## Known limitations

- The bundle is a single chunk; route-level code splitting is planned for Phase 16.
- The home page is a starting point with shortcuts; the personal dashboard replaces it in
  Phase 7.
- No screenshots are published yet; they are added with the final documentation.
- `Tooltip` is part of the design system but not used by a screen yet.

## Git

| Commit    | Message                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `853d7f7` | feat(api-client): add framework-free JavaScript SDK                        |
| `6e5587c` | feat(localization): add interface catalogs for auth, home and settings     |
| `21344e9` | fix(auth): give session restore its own rate limit                         |
| `6afcc6e` | test(api): make database setup deterministic and reuse one server per file |
| `e23d657` | feat(ui): introduce design system tokens and accessible components         |
| `550290d` | feat(web): add application shell, sign-in flows and settings               |
| `b95931e` | docs(architecture): document the web client and design system              |

Push status: pushed to `origin/main` and verified (`origin/main` = `b95931e`).
GitHub Actions: the CI workflow completed successfully for `b95931e` on Node 22 and Node 24.

## Next phase

Phase 4 — Habits and routines.
