# Phase 14 — Application Updates and Remote Configuration

## Objective

Let a client find out, from the server, whether a newer version of itself exists and whether
its own version may keep running — and let whoever runs an installation change a small,
closed set of settings for all running clients without shipping a release. Without
pretending to be an updater: the server answers questions; it does not build or install
applications.

## Implemented

### Update check (API)

- `GET /updates/check` (no sign-in needed): given an application, platform, version, channel
  and optionally an installation id, answers `updateAvailable`, the `latest` release
  (version, notes in Turkish and English, download address, SHA-256, size), `mandatory`,
  `supported` and `minSupportedVersion`.
- Releases per application and platform (or every platform), on a `stable` or `beta`
  channel; beta clients also receive stable releases.
- **Drafts** are offered to nobody until published; a published release can be withdrawn.
- **Gradual rollout** by percentage: an installation is placed in a bucket by a hash of its
  id and the release, so its answer for a release never changes and being early for one
  release says nothing about the next.
- Skipping a mandatory release makes the update mandatory; a client older than the oldest
  supported version is told to stop, independent of any rollout.
- Download addresses must be https.

### Remote configuration (API)

- `GET /config` (no sign-in needed) returns every key of a **closed list**, each with the
  server's value where one applies and otherwise the default that is built into the clients.
- Two keys: `announcement` (a message for everyone, with an id and a tone) and
  `registrationOpen`.
- A stored value can be switched off, limited to some applications, or rolled out to a share
  of installations. Values are validated against the shape of their key.
- **`registrationOpen` is enforced by the server**: while it is false,
  `POST /auth/register` answers `403 REGISTRATION_CLOSED`.

### Administration

- `/admin/releases` and `/admin/config` (list, create, change, publish or withdraw, delete,
  reset), for the `admin` role only.
- The role is granted and revoked **from the command line only**
  (`npm run admin:grant -- <email>`); changing it signs the account out everywhere so that
  it takes effect at once.
- Every administrative change is written to the administrator's security log.

### Web

- **Update notice**: when a newer web version is published, a banner with its notes offers
  to reload; it can be postponed.
- **Required update**: when the running version is no longer supported, the application
  shows only that, the notes, and a reload button.
- **Announcement** banner in the user's language, dismissible; a new message appears again.
- The registration link and form disappear while registration is closed, with an
  explanation on the page.
- **Settings → Administration** for administrators: the announcement (both languages, kind,
  on/off), the registration switch, and the releases (list, publish or withdraw, add,
  delete).

## Architectural decisions

- **No fake updater.** For the web client, updating is reloading; for native clients the
  server provides the facts an updater needs (version, address, checksum) and leaves
  fetching and installing to the platform. See
  [`docs/architecture/updates-and-configuration.md`](../architecture/updates-and-configuration.md).
- **Defaults live in the clients.** A client that cannot reach the configuration endpoint
  behaves as designed; the application never waits for it.
- **A closed, typed list of keys** instead of free-form flags: unknown keys cannot be
  stored, and a value that does not fit its key is refused.
- **Flags that matter are enforced on the server.** Hiding a form is a courtesy.
- **Administrators are created outside the API**, by whoever already controls the server.
- **Rollout buckets are deterministic and per release**, so answers are stable and rollouts
  are independent.
- **Both endpoints are public**, because a client must be able to learn that it is
  unsupported before anyone signs in. They reveal nothing about any account.

## Problems found and fixed during the phase

None in the product. The verification gate itself was changed: API test files are now run
one at a time and repeated until a run completes, because on this machine a natively
crashing test worker (see `docs/development/troubleshooting.md`) can cut a file short
without any assertion failing.

## Important files

`packages/shared-contracts/src/platform.js`,
`apps/api/src/modules/platform/{platform.model,platform.service,platform.routes}.js`,
`apps/api/scripts/admin-role.js`,
`apps/web/src/lib/platform.js`, `apps/web/src/layout/PlatformNotices.jsx`,
`apps/web/src/pages/settings/AdminSection.jsx`,
`packages/localization/locales/{tr,en}/platform.json`,
`docs/architecture/updates-and-configuration.md`.

## Database changes

New collections `appReleases` and `remoteConfig` (neither holds user data). New audit action
`admin.change`. New error code `REGISTRATION_CLOSED` (403).

## API changes

9 new operations: `GET /updates/check` and `GET /config` (group Platform), and 7 in the
group Administration. New scripts `admin:grant` and `admin:revoke`.

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 304 passed (24 files) |
| `@personalitify/web`          | 140 passed (18 files) |
| `@personalitify/api-client`   | 27 passed (3 files)   |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (10): version comparison by number; stable and evenly spread rollout
buckets, independent between rollouts; nothing offered without published releases, drafts
hidden, invalid questions refused; the newest release for the client's platform and channel;
mandatory updates and unsupported versions, and withdrawal; a rollout reaching a stable
share of installations; release validation (https only, checksum, version order,
duplicates); configuration with defaults, targeting, rollout, switching off, shape
validation and reset; registration closed and reopened on the server; administration closed
to regular users, the role granted and revoked through the script with the old token dying
at once, and changes appearing in the security log.

New web tests (10): the announcement shown, dismissed for good, shown again when new; the
update banner and reload; the required-update screen; carrying on when the server cannot be
asked; registration hidden and explained while closed, offered while open; the
administration section hidden from regular users; saving an announcement and closing
registration; listing, publishing, adding (with validation) and deleting releases.

Also passing: `npm run lint`, `npm run format:check`. Local API tests were run one file at a
time; two runs were repeated after a native worker crash.

Manual verification, against the development servers: `admin:grant` was run from the command
line for a seeded account (its previous token was refused immediately afterwards); the
administration section was opened in a browser; an announcement and a published web release
were created through the API and appeared as banners; raising the oldest supported version
replaced the application with the required-update screen. No console errors. The test
release and announcement were removed from the development database afterwards.

## Build results

`npm run build` succeeded: 1,487.7 kB JavaScript (440.5 kB gzip).

## Known limitations

- There is no binary updater: native clients must fetch, verify and install updates
  themselves, using the address and checksum from the check.
- For the web client, a release record is not tied to a deployment: it must be published
  after the new bundle is deployed. Setting an oldest supported version higher than the
  deployed bundle would stop every web client, administrators included; the record can then
  be corrected through the API or the database.
- Only two configuration keys exist. Adding one is a code change by design.
- Versions are `major.minor.patch` only; pre-release suffixes are not supported.
- The administration screen edits the announcement, registration and releases; rollout and
  application targeting of configuration values are available through the API only.

## Git

| Commit    | Message                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `aded77f` | feat(platform): add update checks, remote configuration and administration    |
| `9dfbbdc` | feat(api-client): add platform and admin namespaces                           |
| `b4b1c43` | feat(web): show announcements and updates, and add the administration section |
| `493cf2a` | docs: document updates and configuration and record phase 14                  |

Push status: pushed to `origin/main` and verified (`origin/main` = `493cf2a`).
GitHub Actions: the CI workflow completed successfully for `493cf2a` on Node 22 and Node 24.

## Next phase

Phase 15 — API SDK and Rust client compatibility.
