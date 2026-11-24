# Roadmap

Phases are delivered in order. A phase is complete only when it is implemented, tested,
documented, committed and pushed. Each completed phase has a report in
[`docs/releases/`](./releases/).

| Phase | Scope                                            | Status  | Report                             |
| ----- | ------------------------------------------------ | ------- | ---------------------------------- |
| 0     | Repository audit and technical planning          | Done    | [phase-00](./releases/phase-00.md) |
| 1     | Monorepo and development infrastructure          | Done    | [phase-01](./releases/phase-01.md) |
| 2     | Backend core and security                        | Planned |                                    |
| 3     | Frontend foundation and design system            | Planned |                                    |
| 4     | Habits and routines                              | Planned |                                    |
| 5     | Goals and tasks                                  | Planned |                                    |
| 6     | Calendar and planning                            | Planned |                                    |
| 7     | Personal dashboard                               | Planned |                                    |
| 8     | Analytics and insights                           | Planned |                                    |
| 9     | Focus, journal and mood                          | Planned |                                    |
| 10    | Achievements and gamification                    | Planned |                                    |
| 11    | Notifications and background jobs                | Planned |                                    |
| 12    | Event infrastructure and real-time communication | Planned |                                    |
| 13    | Synchronization engine                           | Planned |                                    |
| 14    | Application updates and remote configuration     | Planned |                                    |
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
