# Security

What Personalitify protects, against what, and how — with the place in the code and the
test that holds each measure in place. This is a description of what is implemented, not a
certification; the limits are listed at the end.

To report a vulnerability, see [`SECURITY.md`](../../SECURITY.md).

## What is being protected

An account holds a person's habits, plans, mood and journal. The journal and the mood notes
are the most sensitive data in the product. The goals are:

1. Nobody reads or changes another person's data.
2. Nobody takes over an account — by guessing, by stealing a token, or by a mistake of ours.
3. The service stays available to its users when someone misuses it.
4. A person can take their data out and have it deleted.

## Identity

| Measure                                                                                                                                                                                               | Where                                           | Held by                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Passwords are stored as **scrypt** hashes (N = 2¹⁵, r = 8, p = 3, per-password salt), never in plain text; verification is constant-time                                                              | `core/crypto.js`                                | `auth.test.js`                     |
| Access tokens are short-lived (15 min) signed JWTs with a pinned algorithm (HS256), issuer and audience; the secret must be at least 32 characters                                                    | `modules/auth/access-token.js`, `config/env.js` | `auth.test.js`, `env.test.js`      |
| **The session is checked on every request**, so signing out or revoking a device takes effect at once, not when the token expires                                                                     | `middleware/authenticate.js`                    | `auth.test.js`, `realtime.test.js` |
| Refresh tokens are 384 random bits, stored only as SHA-256 hashes, **single-use and rotated**; presenting a used one closes the session (theft detection), with a ten-second grace for honest retries | `modules/auth/session.service.js`               | `auth.test.js`                     |
| For browsers the refresh token is an **HttpOnly, SameSite=Strict** cookie limited to `/api/v1/auth`, and `Secure` in production; JavaScript never sees it and the access token is never stored        | `modules/auth/cookies.js`, web `lib/api.js`     | `auth.test.js`, `security.test.js` |
| Sign-in and password-reset answers do not reveal whether an address has an account                                                                                                                    | `modules/auth/auth.service.js`                  | `auth.test.js`                     |
| E-mail verification and reset tokens are random, single-use, expiring and stored hashed                                                                                                               | `modules/auth/auth-token.model.js`              | `auth.test.js`                     |
| Changing the password, and changing the administrator role, signs the account out everywhere else                                                                                                     | `auth.service.js`, `scripts/admin-role.js`      | `auth.test.js`, `platform.test.js` |
| The `admin` role can only be granted from the server's command line                                                                                                                                   | `scripts/admin-role.js`                         | `platform.test.js`                 |

## Isolation between accounts

Every stored record belongs to a user, and **every query is scoped by the caller's user id**
— in the entity service that all modules write through, and in each read. A record of
another account is answered `404`, the same as one that does not exist.

Held by `authorization.test.js` (every route refuses an anonymous caller and another
account's ids) and by an isolation case in the test file of every module, including
synchronization, realtime, notifications and the account export.

The realtime connection joins rooms named after the verified token's user, session and
device; events are published to the owner's room only (`realtime.test.js`).

## Input

| Measure                                                                                                                                                                                             | Where                                | Held by            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------ |
| Every request body, query and path parameter is validated against a **strict schema**; unknown fields are rejected, so nothing reaches the database that was not declared                           | `core/routing.js`, route files       | every module test  |
| Keys that MongoDB could read as operators or paths (`$gt`, `a.b`) are refused before validation                                                                                                     | `middleware/security.js`             | `security.test.js` |
| Search text is escaped before it is used in a pattern; the journal search cannot be turned into an expensive expression                                                                             | `modules/journal/journal.service.js` | `journal.test.js`  |
| JSON bodies are limited to 1 MB; lists are paginated with a maximum page size; ranges are capped (400 days, 62 days for the calendar, 500 events, 100 pushed operations)                            | `app.js`, route files                | module tests       |
| Operations replayed through `POST /sync/push` go through the same validation and authorization as the requests they stand for, and sign-in, account and device operations cannot be replayed at all | `modules/sync/sync.service.js`       | `sync.test.js`     |

## Output and the browser

| Measure                                                                                                                                     | Where                                          | Held by                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| The API serves JSON with a content policy of `default-src 'none'`, `frame-ancestors 'none'`, `nosniff`, no referrer, and HSTS in production | `middleware/security.js`                       | `security.test.js`                     |
| Cross-origin requests are accepted only from the configured web origins, for the API and for the realtime connection                        | `middleware/security.js`, `realtime.server.js` | `security.test.js`                     |
| Responses are built by explicit serializers: password hashes, token hashes and internal fields have no way into an answer                   | model files                                    | `account.test.js`, `contracts.test.js` |
| Errors carry a stable code and a translated message; unexpected errors are logged in full and answered without detail                       | `middleware/error-handler.js`                  | `security.test.js`                     |
| **Markdown** written by the user is rendered without raw HTML, without images, and with dangerous link protocols removed                    | web `ui/Markdown.jsx`                          | `markdown.test.jsx`                    |
| The web client builds no HTML from strings; React escapes all text                                                                          | —                                              | lint, review                           |

## Abuse and availability

| Limit                                                   | Value                     |
| ------------------------------------------------------- | ------------------------- |
| Requests per client address                             | 300 a minute              |
| Sign-in, registration, password reset, account deletion | 10 a minute               |
| Token refresh                                           | 60 a minute               |
| `POST /sync/push` (up to 100 operations each)           | 30 a minute               |
| Realtime connections per account                        | 20 (the oldest is closed) |
| Replay requests per realtime connection                 | 30 per 10 seconds         |
| Realtime message size                                   | 100 kB                    |

Limits are kept in the memory of the API process (`middleware/rate-limit.js`), which fits a
single instance; several instances would each count on their own.

Behind a reverse proxy, set `TRUST_PROXY_HOPS` to the number of proxies. Without it the API
sees the proxy as the only client and the per-address limits apply to everyone together;
with a number too high, a client could forge its address. The API trusts exactly that many
hops of `X-Forwarded-For` and never the header as a whole.

## Configuration

Configuration is validated at startup and the process refuses to start when it is wrong
(`config/env.js`, `env.test.js`, `hardening.test.js`). In **production** it additionally
refuses settings that are only safe on a developer machine: a refresh cookie without
`Secure`, web origins that are not https, and a public URL that is not https.

Secrets come from the environment. Nothing secret is in the repository; `.env` is ignored,
and `.env.example` holds no working value. The development setup generates its own random
JWT secret on first run.

## Privacy

- **Journal and mood text is never logged.** Request logs contain the method, path, status,
  duration and user id — no bodies, no query strings. Authorization headers, cookies and
  password fields are redacted from anything that is logged (`core/logger.js`).
- Lists of journal entries return previews, and no preview at all when the user switched
  "hide sensitive previews" on. Notifications never contain journal or mood text.
- **Export and deletion.** `GET /account/export` returns everything stored about the
  account; `DELETE /account` (with the password) erases it. Both iterate one registry that
  every collection with personal data is part of, so a new module cannot be forgotten
  (`core/user-data.js`, `account.test.js`).
- Security-relevant actions (sign-ins, failed sign-ins, password changes, removed devices,
  exports, administrative changes) are recorded in a security log the user can read; it
  expires after 180 days.
- Nothing is sent to third parties. There are no analytics, trackers or external fonts; the
  only outbound traffic is e-mail through the SMTP server the operator configures.

## Dependencies

`npm audit` reports no known vulnerabilities at the time of writing (checked in Phase 16;
it is worth running again before every release). Dependencies are few and mainstream, the
lockfile is committed, and CI installs with `npm ci`.

## Limits — what this does not do

- **No end-to-end encryption.** Data is protected in transit by TLS (which the operator's
  reverse proxy must provide) and at rest by whatever the database host provides. Whoever
  operates the server and its database can read the data.
- **Registration tells whether an address is taken** (`EMAIL_ALREADY_REGISTERED`), as most
  services do; sign-in and password reset do not.
- **No second factor** and no single sign-on. An account is protected by its password and
  by the measures above.
- **No breached-password check and no password-strength meter** beyond a minimum length of
  eight characters and refusing a password equal to the address.
- **Rate limits are per process and in memory**; they reset on restart and are not shared
  between instances.
- **No web application firewall, no CAPTCHA.** Registration can be closed entirely (remote
  configuration), but an open installation can be registered on by anyone.
- **No independent audit or penetration test** has been performed.
- TLS termination, database access control, backups and operating-system hardening are the
  operator's responsibility and outside this repository.
