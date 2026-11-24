# Application updates and remote configuration

What a client asks the server about itself, and how whoever runs an installation answers.
Code: `apps/api/src/modules/platform`; shared rules:
`packages/shared-contracts/src/platform.js`. Endpoints: `/api/v1/updates/check`,
`/api/v1/config` and `/api/v1/admin/…` (groups Platform and Administration in the OpenAPI
document).

## What this is, and what it is not

The server **does not build, sign, host or install applications**. There is no binary
updater here, and none is pretended. What exists is the part every updater needs first and
that only the server can provide: an honest answer to "is there a newer version of me, must
I take it, and where is it?".

- For the **web client**, updating is loading the page again. The web client asks the
  question and, when the answer is yes, offers to reload — or insists, when its version is
  no longer supported.
- For a **desktop or mobile client**, the answer carries a download address and a checksum.
  Fetching, verifying and installing are the client's job (for the planned desktop client:
  the platform's own updater), and are outside this repository.

## Releases

A release is a record: application, platform (or `any`), channel, version, and optionally
release notes in Turkish and English, a download address (https only), a SHA-256 checksum, a
size, a rollout percentage, whether it is mandatory, and the oldest version that is still
supported. A release is a **draft** until it is published; drafts are offered to nobody.

### The question

```
GET /updates/check?appId=personalitify-desktop&platform=windows&version=1.0.0
                  &channel=stable&installationId=<uuid>
```

No sign-in is needed, so a client can ask before the user has an account.

### The answer

| Field                 | Meaning                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `updateAvailable`     | a newer published release is offered to this installation                    |
| `latest`              | that release: version, notes, download address, checksum, size               |
| `mandatory`           | the client must not skip it                                                  |
| `supported`           | false: the client is older than the oldest supported version and should stop |
| `minSupportedVersion` | that oldest version, when one is set                                         |

The rules, in full:

1. Candidates are the published releases of the application for the client's platform or
   for `any`, on the client's channel. The `beta` channel also receives `stable` releases;
   `stable` never receives `beta`.
2. Of those, the ones **newer** than the client's version **and inside their rollout** are
   offered; `latest` is the newest.
3. `mandatory` is true when any offered release is marked mandatory — skipping a mandatory
   release does not make it optional — or when the client is unsupported.
4. `supported` compares the client's version with the highest `minSupportedVersion` among
   the published releases. It ignores rollouts: an unsupported version is unsupported for
   everyone.

Versions are `major.minor.patch` and are compared as numbers (`1.10.0` is newer than
`1.9.9`).

### Gradual rollout

A release with `rolloutPercent` below 100 is offered to that share of installations. The
client sends its installation id; the server places it in one of 100 buckets by a hash of
the id **and the release**, so an installation always gets the same answer for a release,
and being early for one release says nothing about the next. A client that sends no
installation id is offered only releases that are rolled out to everyone.

## Remote configuration

Settings the server can change for running clients without a new release. The list of keys
is closed and lives in the shared contracts, **each with a default that is built into every
client** — a client that cannot reach the server behaves exactly as designed.

| Key                | Default | Meaning                                                          |
| ------------------ | ------- | ---------------------------------------------------------------- |
| `announcement`     | `null`  | a message for everyone: `{ id, tone, message: { tr, en } }`      |
| `registrationOpen` | `true`  | whether new accounts can be created — **enforced by the server** |

```
GET /config?appId=personalitify-web&installationId=<uuid>   → { values: { … } }
```

A stored value can be switched off, limited to some applications, or rolled out to a share
of installations (same bucket rule as releases). Every answer contains every key.

Two things keep this from becoming a second, hidden code path:

- **Values are validated per key.** The server refuses a value that does not have the shape
  of its key, so a client never has to defend itself against a malformed flag.
- **Security-relevant flags are enforced on the server.** Closing registration makes
  `POST /auth/register` answer `403 REGISTRATION_CLOSED`; the web client additionally hides
  the form, but hiding it is a courtesy, not the control.

Adding a key means adding it, with its default, to `REMOTE_CONFIG_DEFAULTS`, giving it a
schema in `platform.routes.js`, and using it. Unknown keys cannot be stored.

## Administration

Releases and configuration are managed through `/admin/…`, which requires the **`admin`
role**. The web client shows an "Administration" section in the settings to administrators.

The role is never granted through the API:

```
npm run admin:grant  -- person@example.com
npm run admin:revoke -- person@example.com
```

Whoever can run this already has access to the server and its database — the right bar for
creating administrators. Because the role is part of the access token, changing it signs
the account out everywhere, so it takes effect at once.

Every administrative change is written to the administrator's security log
(`admin.change`, with what was changed).

## Publishing a new web version

1. Deploy the new bundle (its version is the `version` of `apps/web/package.json`).
2. Record the release: application "Web", the new version, notes — and publish it.
3. Open clients learn about it within half an hour (or on their next start) and offer to
   reload. If older bundles must not keep running — for example after a breaking API
   change — set "oldest supported version"; those clients stop and ask for the reload.
