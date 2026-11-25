# Documentation · Belgeler

An index of everything under `docs/` and the documents next to the code.
`docs/` altındaki ve kodun yanındaki tüm belgelerin dizini.

## Start here · Buradan başlayın

| Document                                                           | Language | Content                                       |
| ------------------------------------------------------------------ | -------- | --------------------------------------------- |
| [README.md](../README.md)                                          | TR       | Proje tanıtımı, özellikler, hızlı başlangıç   |
| [README.en.md](../README.en.md)                                    | EN       | Project introduction, features, quick start   |
| [development/setup.md](./development/setup.md)                     | EN + TR  | Local setup, scripts, MongoDB, administrators |
| [development/troubleshooting.md](./development/troubleshooting.md) | EN + TR  | Common problems and their causes              |
| [CONTRIBUTING.md](../CONTRIBUTING.md)                              | EN + TR  | Conventions, commits, how to add a module     |
| [SECURITY.md](../SECURITY.md)                                      | EN + TR  | How to report a vulnerability                 |

## Architecture

| Document                                                                    | Content                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| [overview.md](./architecture/overview.md)                                   | The system as a whole: clients, backend, data flow        |
| [decisions.md](./architecture/decisions.md)                                 | Architecture decision records                             |
| [backend.md](./architecture/backend.md)                                     | Modules, the route registry, the entity service           |
| [frontend.md](./architecture/frontend.md)                                   | The web client: structure, design system, state           |
| [database.md](./architecture/database.md)                                   | Collections and indexes                                   |
| [time-and-recurrence.md](./architecture/time-and-recurrence.md)             | Calendar dates, time zones, recurrence rules              |
| [event-system.md](./architecture/event-system.md)                           | The outbox, the event stream and realtime delivery        |
| [synchronization.md](./architecture/synchronization.md)                     | Snapshots, change cursors, pushes and conflict resolution |
| [notifications-and-jobs.md](./architecture/notifications-and-jobs.md)       | Reminders, quiet hours and the background job runner      |
| [focus-timer.md](./architecture/focus-timer.md)                             | Server-timed focus sessions                               |
| [analytics.md](./architecture/analytics.md)                                 | How every figure and highlight is computed                |
| [achievements.md](./architecture/achievements.md)                           | Experience points, levels and achievements                |
| [updates-and-configuration.md](./architecture/updates-and-configuration.md) | Release records, update checks, remote configuration      |
| [security.md](./architecture/security.md)                                   | What is protected, how, and what is not                   |
| [performance.md](./architecture/performance.md)                             | Measured bundle sizes and response times                  |
| [rust-client-compatibility.md](./architecture/rust-client-compatibility.md) | What a native client needs from the contracts             |

## API

| Document                                              | Content                                                   |
| ----------------------------------------------------- | --------------------------------------------------------- |
| [api/overview.md](./api/overview.md)                  | Conventions: envelope, errors, authentication, versioning |
| [api/openapi.json](./api/openapi.json)                | OpenAPI document, generated from the registered routes    |
| [api/schemas/](./api/schemas/)                        | JSON Schemas of entities, events and sync messages        |
| [api-client README](../packages/api-client/README.md) | The JavaScript client for the API, realtime and sync      |
| [desktop README](../apps/desktop/README.md)           | The place reserved for the Rust client                    |

A running API also serves the reference at `/api/v1/docs` and the document at
`/api/v1/openapi.json`.

## Project history

| Document                        | Content                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| [roadmap.md](./roadmap.md)      | The eighteen phases and their state                        |
| [releases/](./releases/)        | One report per phase: what was built, tested and left open |
| [CHANGELOG.md](../CHANGELOG.md) | Changes by version                                         |
| [screenshots/](./screenshots/)  | Pictures of the running application used in the README     |
