# API Overview

The Personalitify API is plain HTTP + JSON and is the same for every client.

- **Base path:** `/api/v1`
- **Reference:** [`openapi.json`](./openapi.json) (OpenAPI 3.0, generated from the code).
  A running server also serves it at `/api/v1/openapi.json` and a browsable version at
  `/api/v1/docs`.
- **Regenerate:** `npm run docs:api`. A test fails when the committed file is out of date.

## Envelope

Success:

```json
{ "data": { "id": "…" }, "meta": { "page": 1, "limit": 50, "total": 3, "totalPages": 1 } }
```

`meta` is present on paginated lists. `204 No Content` responses have no body.

Failure:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some of the information provided is not valid.",
    "details": [
      {
        "path": "email",
        "location": "body",
        "code": "invalid_email",
        "message": "Enter a valid email address."
      }
    ],
    "requestId": "0d5d0a0e-6f1c-4d0a-9d55-3f0f3c0e9a11"
  }
}
```

- `code` is stable and meant for programs. The full list is in
  `packages/shared-contracts/src/errors.js` and in the OpenAPI `Error` schema.
- `message` is for people and follows `Accept-Language` (`tr` default, `en`).
- `requestId` is also returned in the `X-Request-Id` header. A client may send its own
  `X-Request-Id` (8–64 characters of `A-Z a-z 0-9 _ -`).

## Data formats

| Kind          | Format                               | Example                    |
| ------------- | ------------------------------------ | -------------------------- |
| Identifier    | UUID string                          | `7f1e…-…`                  |
| Instant       | ISO 8601, UTC                        | `2026-11-24T16:00:00.000Z` |
| Calendar date | `YYYY-MM-DD` in the user's time zone | `2026-11-24`               |
| Time of day   | `HH:mm`, 24-hour                     | `07:30`                    |
| Time zone     | IANA name                            | `Europe/Istanbul`          |
| Weekday       | ISO number, Monday = 1 … Sunday = 7  | `1`                        |

Unknown request fields are rejected, not ignored.

## Authentication

### Sign in

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "ada@example.com",
  "password": "correct horse battery",
  "device": {
    "installationId": "0b0f6f0a-58a5-4a40-9f6c-4f1b8a0b7c11",
    "name": "Ada's ThinkPad",
    "clientType": "desktop",
    "platform": "windows",
    "appId": "personalitify-desktop",
    "appVersion": "0.1.0"
  }
}
```

```json
{
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs…",
      "tokenType": "Bearer",
      "expiresIn": 900,
      "accessTokenExpiresAt": "2026-11-24T16:15:00.000Z",
      "refreshToken": "q1Zr…",
      "refreshTokenExpiresAt": "2026-12-24T16:00:00.000Z",
      "sessionId": "3c0c…",
      "deviceId": "a41d…"
    },
    "user": { "id": "…", "email": "ada@example.com", "emailVerified": true, "role": "user" },
    "profile": { "id": "…", "version": 3, "displayName": "Ada" },
    "settings": { "id": "…", "version": 5, "language": "en", "timeZone": "Europe/London" }
  }
}
```

`installationId` is generated once by the client and reused for every sign-in from that
installation. The server answers with its own `deviceId` for it.

### Calling the API

```http
GET /api/v1/users/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs…
```

| `401` code        | Meaning                           | What the client does          |
| ----------------- | --------------------------------- | ----------------------------- |
| `TOKEN_EXPIRED`   | Access token is past its lifetime | Refresh, then retry once      |
| `SESSION_REVOKED` | The session was signed out        | Discard tokens, sign in again |
| `UNAUTHENTICATED` | Missing or invalid token          | Sign in                       |

### Refreshing

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "q1Zr…" }
```

The response is a new token set. **The refresh token is single-use**: store the new one
before using the new access token. If the old token is presented again later, the server
treats it as theft and closes the session (`REFRESH_TOKEN_REUSED`). A duplicate request
within ten seconds of the rotation (a retry after a lost response) is only rejected with
`INVALID_REFRESH_TOKEN`; the session survives. A client must therefore serialize its refresh
calls.

Browser clients (`clientType: "web"`) never see the refresh token: it is set as an
`HttpOnly; SameSite=Strict` cookie for `/api/v1/auth`, `tokens.refreshToken` is `null`, and
they call `/auth/refresh` with an empty JSON body.

### Sessions and devices

- `GET /auth/sessions`, `DELETE /auth/sessions/{sessionId}`
- `POST /auth/logout`, `POST /auth/logout-all`
- `GET /devices`, `GET /devices/current`, `PATCH /devices/{deviceId}`,
  `DELETE /devices/{deviceId}` (also signs the device out)

## Optimistic concurrency

Synchronized resources carry `version`. Send the version you edited as `baseVersion`:

```http
PATCH /api/v1/settings
{ "theme": "dark", "baseVersion": 4 }
```

- Current version → applied, `version` becomes 5.
- Stale version, but the server-side changes since then touched **other** fields → merged
  and applied.
- Stale version and an overlapping field →

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This item was changed somewhere else. Review the latest version and try again.",
    "details": {
      "entityType": "settings",
      "entityId": "…",
      "currentVersion": 6,
      "conflictingFields": ["theme"],
      "current": { "id": "…", "version": 6, "theme": "light" }
    },
    "requestId": "…"
  }
}
```

Omitting `baseVersion` applies the change to the latest version (last write wins). Clients
that can work offline should always send it.

## Rate limits

| Scope                | Limit                 |
| -------------------- | --------------------- |
| All endpoints        | 300 requests / minute |
| Credential endpoints | 10 requests / minute  |

Exceeding a limit returns `429 RATE_LIMITED` with a `Retry-After` header (seconds).

## Versioning

Additive changes (new endpoints, new optional fields, new enum values in responses) are made
within `/api/v1`. Clients must ignore response fields they do not know. Anything that could
break an existing client is published under a new prefix.
