# Focus timer

How the timer works across devices, and what a client has to do to show it correctly. Code:
`apps/api/src/modules/focus`. Endpoints: `/api/v1/focus…` (group Focus in the OpenAPI
document).

## The server owns the clock

A timer that lives in one browser tab stops being true the moment the tab sleeps, the device
changes or two devices are open. So a session is a record on the server, and every instant
in it is set by the server:

| Client asks            | Server records                                           |
| ---------------------- | -------------------------------------------------------- |
| `POST /focus/sessions` | `startedAt = now`, `status = running`                    |
| `POST …/{id}/pause`    | `pausedAt = now`, `elapsedSeconds` so far                |
| `POST …/{id}/resume`   | adds the pause to `pausedSeconds`, clears `pausedAt`     |
| `POST …/{id}/complete` | `endedAt`, final `elapsedSeconds`, `status = completed`  |
| `POST …/{id}/cancel`   | `endedAt`, `status = cancelled` (counts towards nothing) |

A client never sends a time or a duration; the request schemas reject them.

- `elapsedSeconds` is the time spent **without pauses**, capped at the planned length.
- A running session ends at `endsAt = startedAt + plannedMinutes + pausedSeconds`. The
  server returns it; clients do not compute it.
- A user has **one active session** (running or paused) at a time, enforced by a unique
  index. Starting a second one answers `409 INVALID_STATE` with
  `details.reason = "session_active"` and the `sessionId` of the one that is active.
- A session whose `endsAt` has passed is **completed by the server** at exactly `endsAt` the
  next time the timer is read — no client needs to be open when it runs out.
- `complete` and `cancel` are idempotent for the state they produce, so a client that
  reports the end a moment after the server already recorded it gets the same session back.

## Drawing the countdown

`GET /focus` returns the active session, the user's timer lengths, today's and the last
seven days' focus time, what to suggest next, and `serverTime`.

1. On every answer, note the difference between `serverTime` and the device clock.
2. While `status` is `running`, show `endsAt − (device clock + difference)`.
3. While `paused`, show `plannedMinutes × 60 − elapsedSeconds`; it does not move.
4. When the countdown reaches zero, call `complete` once and show what comes back.

Step 1 is what keeps two devices with different clocks on the same second. Step 4 is a
courtesy to the user, not a requirement: the server would complete the session anyway.

## What counts

Statistics count **completed focus sessions** only — breaks and cancelled sessions are kept
in the history but add nothing. A session finished early counts with the time actually
spent. Days are the user's calendar days (`date` is fixed when the session starts, so a
session that crosses midnight belongs to the day it began).

`suggestedKind` follows the usual rhythm: after a completed focus session a break — a long
one after every `longBreakEvery` focus sessions of the day — and otherwise focus. It is a
suggestion; any kind can be started at any time.

## Other clients

The same contract serves the planned desktop client: it needs no timer state of its own
beyond the last `GET /focus` answer and the clock difference. From Phase 12 the session's
changes also arrive as `focusSession.*` events, so an open client can follow a timer that
was started, paused or finished on another device without polling.
