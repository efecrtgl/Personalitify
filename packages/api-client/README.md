# @personalitify/api-client

The JavaScript client for the Personalitify API. It has no dependency on a UI framework or
on the browser: give it a `fetch` and a place to keep tokens and it runs in a browser, in
Node.js, or in any other JavaScript runtime. The web application uses nothing else to talk
to the server.

It is also the **reference implementation** of the protocols a client in another language
has to speak — see
[`docs/architecture/rust-client-compatibility.md`](../../docs/architecture/rust-client-compatibility.md).

## Creating a client

```js
import { createApiClient, createMemoryTokenStore } from '@personalitify/api-client';

const api = createApiClient({
  baseUrl: 'https://personalitify.example', // omit in a browser on the same origin
  tokenStore: createMemoryTokenStore(),
  getLanguage: () => 'tr', // sent as Accept-Language
  onSessionEnded: (code) => showSignIn(code), // the session is over; sign in again
});
```

| Option           | Purpose                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `baseUrl`        | Origin of the API. The `/api/v1` prefix is added by the client.             |
| `fetch`          | A `fetch` implementation; defaults to the global one.                       |
| `credentials`    | Passed to `fetch`. Browsers use `'include'` so the refresh cookie travels.  |
| `tokenStore`     | Where tokens live. See below.                                               |
| `getLanguage`    | Returns the language for `Accept-Language`.                                 |
| `onSessionEnded` | Called once when the server ends the session (revoked, or refresh refused). |
| `refreshLock`    | Wraps the token refresh, to serialize it across browser tabs (Web Locks).   |

### Tokens

`createMemoryTokenStore()` keeps the tokens in memory, which is right for a browser: the
access token never touches storage and the refresh token is an HttpOnly cookie that
JavaScript cannot read. A native client provides a store with the same methods
(`getAccessToken`, `getAccessTokenExpiry`, `getRefreshToken`, `setTokens`, `getSession`,
`clear`) that keeps the refresh token in the operating system's credential store.

The client refreshes the access token by itself — shortly before it expires and after a
`TOKEN_EXPIRED` answer — with one refresh shared by all concurrent requests, because a
refresh token can be used only once.

## Calling the API

Each namespace mirrors a section of the API reference
([`docs/api/openapi.json`](../../docs/api/openapi.json)); a method returns the `data` of the
answer.

```js
const { user, profile, settings } = await api.auth.login({ email, password, device });

const habit = await api.habits.create({ name: 'Kitap oku', color: '#5e5ce6' });
await api.habits.setEntry(habit.id, '2026-11-24', { value: 1 });

const { items, meta } = await api.tasks.list({ page: 1, limit: 50 }); // paginated
await api.tasks.update(task.id, { title: 'Yeni başlık', baseVersion: task.version });
```

Namespaces: `health`, `auth`, `users`, `settings`, `devices`, `account`, `categories`,
`habits`, `goals`, `tasks`, `calendar`, `dashboard`, `analytics`, `focus`, `journal`, `mood`,
`achievements`, `notifications`, `events`, `sync`, `platform`, `admin`.

A test (`tests/coverage.test.js`) holds the client against the API reference: every
operation of the API is reachable through a method, and the client calls nothing the API
does not have.

### Errors

A failed request rejects with an `ApiError`:

```js
import { ApiError } from '@personalitify/api-client';

try {
  await api.tasks.update(id, { title, baseVersion });
} catch (error) {
  if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
    const { current, conflictingFields } = error.details; // decide, then retry on `current`
  }
}
```

`code` is the stable contract (`ERROR_CODES` in `@personalitify/shared-contracts`, plus
`NETWORK_ERROR` and `INVALID_RESPONSE` for failures before an answer). `message` is for
people and already in the requested language; `fieldErrors` maps field paths to messages
for `VALIDATION_FAILED`; `status`, `details` and `requestId` come from the answer.

## Realtime

```js
import { createRealtime } from '@personalitify/api-client';

const realtime = createRealtime({
  url: 'https://personalitify.example', // omit on the same origin
  getToken: () => api.http.getFreshAccessToken(),
  onEvent: (event) => apply(event), // every event once, in order
  onReset: () => reloadEverything(), // away too long to replay
  onStatus: (status) => {}, // connecting | connected | disconnected | unauthorized
  cursor: storedCursor, // optional: where a client that persists its position resumes
});
realtime.connect();
```

Events are delivered exactly once and in the order of the account's log, whatever the
connection does. The part that guarantees it, `EventSequencer`, is exported separately and
works with any transport that can fetch "the events after N".

## Synchronization

For a client that keeps its own copy of the data:

```js
import { createSyncReplica } from '@personalitify/api-client';

const replica = createSyncReplica({ sync: api.sync });
await replica.bootstrap(); // full copy
await replica.pull(); // later: what changed since

replica.enqueue({ method: 'POST', path: `/tasks/${id}/complete` }); // while offline
await replica.flush(); // back online: each operation carried out once
await replica.pull();

const state = replica.dump(); // persist; `restore(state)` after a restart
```

The replica holds entities in memory. It is a reference: a real client keeps the logic and
replaces the storage. The protocol is described in
[`docs/architecture/synchronization.md`](../../docs/architecture/synchronization.md).

## Tests

```bash
npm test --workspace @personalitify/api-client
```

The transport, the event sequencer, the replica and the coverage of the API are tested here
without a server; the same client is run against a real server in `apps/api/tests`
(`realtime.test.js`, `sync.test.js`, `contracts.test.js`).
