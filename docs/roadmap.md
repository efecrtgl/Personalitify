# Roadmap

Phases are delivered in order. A phase is complete only when it is implemented, tested,
documented, committed and pushed. Each completed phase has a report in
[`docs/releases/`](./releases/).

| Phase | Scope                                            | Status  | Report                             |
| ----- | ------------------------------------------------ | ------- | ---------------------------------- |
| 0     | Repository audit and technical planning          | Done    | [phase-00](./releases/phase-00.md) |
| 1     | Monorepo and development infrastructure          | Done    | [phase-01](./releases/phase-01.md) |
| 2     | Backend core and security                        | Done    | [phase-02](./releases/phase-02.md) |
| 3     | Frontend foundation and design system            | Done    | [phase-03](./releases/phase-03.md) |
| 4     | Habits and routines                              | Done    | [phase-04](./releases/phase-04.md) |
| 5     | Goals and tasks                                  | Done    | [phase-05](./releases/phase-05.md) |
| 6     | Calendar and planning                            | Done    | [phase-06](./releases/phase-06.md) |
| 7     | Personal dashboard                               | Done    | [phase-07](./releases/phase-07.md) |
| 8     | Analytics and insights                           | Done    | [phase-08](./releases/phase-08.md) |
| 9     | Focus, journal and mood                          | Done    | [phase-09](./releases/phase-09.md) |
| 10    | Achievements and gamification                    | Done    | [phase-10](./releases/phase-10.md) |
| 11    | Notifications and background jobs                | Done    | [phase-11](./releases/phase-11.md) |
| 12    | Event infrastructure and real-time communication | Done    | [phase-12](./releases/phase-12.md) |
| 13    | Synchronization engine                           | Done    | [phase-13](./releases/phase-13.md) |
| 14    | Application updates and remote configuration     | Done    | [phase-14](./releases/phase-14.md) |
| 15    | API SDK and Rust compatibility                   | Planned |                                    |
| 16    | Quality, security and performance                | Planned |                                    |
| 17    | Final documentation and release                  | Planned |                                    |

## Cross-phase note on events

Phases 4–11 already write every change through the versioned entity service and its outbox
(introduced in Phase 2), so no module has to be retrofitted later. Phase 12 adds the relay's
realtime delivery and replay; Phase 13 adds device cursors, client-submitted operations and
conflict resolution on top of the same records.

## After the initial release

- Personalitify Desktop (Rust) against the documented contracts.
- Native push notification providers behind the existing delivery interface.
- Additional languages through new localization catalogs.
