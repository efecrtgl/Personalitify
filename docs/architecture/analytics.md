# Analytics

How the figures on the analytics screen are defined. The rule of the module: **every number
is counted from the user's own records at request time.** Nothing is estimated, nothing is
stored separately, and there is no composite "productivity score".

Code: `apps/api/src/modules/analytics`. Endpoint: `GET /api/v1/analytics/overview`.

## Periods

A period is always a whole calendar **week**, **month**, **quarter** or **year** in the
user's time zone, chosen by any date inside it (default: today). Weeks start on the user's
configured first day of the week.

Every answer also carries the key figures of the **previous period of the same kind**, so
"better or worse than before" compares like with like.

A period that contains today is still running (`complete: false`). Its rates are comparable
with earlier periods; its counts are not, and the highlights never compare counts of a
running period.

For charts, the period is cut into steps (`series`):

| Period  | Step  | Note                                                        |
| ------- | ----- | ----------------------------------------------------------- |
| week    | day   | 7 steps                                                     |
| month   | day   | 28–31 steps                                                 |
| quarter | week  | weeks are cut at the edges of the quarter; no day is shared |
| year    | month | 12 steps                                                    |

## Habit figures

A **due day** is a day on which a fixed-schedule habit was scheduled (or to which an
occurrence was postponed). A due day can be **judged** when it is completed or missed:

- _completed_ — the day's target was reached;
- _missed_ — the day is in the past and the target was not reached.

Left out of both sides of every rate:

- skipped and postponed days (deliberate, not a failure);
- today while it is still open, and future days;
- days after a habit was archived or after its end date.

`rate = completed / due`, and `null` when nothing could be judged — never `0`, which would
claim a failure that did not happen.

The totals, the series and the weekday breakdown cover **fixed-schedule habits**, because
only they have due days. The per-habit list includes **flexible habits** ("3 times a week")
in their own unit: a week or month is _completed_ when its quota was met and _missed_ when
it ended without it. Each row states its unit (`days`, `weeks` or `months`).

## Task figures

| Figure           | Definition                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `completed`      | tasks finished on a day of the period (`completedOn`)                 |
| `due`            | tasks whose due date lies in the period, cancelled ones left out      |
| `dueCompleted`   | of those, the ones that are done                                      |
| `onTime`         | finished tasks with a due date, finished on or before it              |
| `late`           | finished tasks with a due date, finished after it                     |
| `withoutDueDate` | finished tasks that had no due date                                   |
| `onTimeRate`     | `onTime / (onTime + late)`; `null` when no dated task was finished    |
| `overdueOpen`    | open tasks past their due date **right now** (not tied to the period) |

`completedOn` is the user's calendar date at the moment of completion, stored with the task,
so a later change of time zone does not move past work to another day.

Finished tasks are also broken down by priority and by category. Tasks of a category that
has since been deleted count as uncategorised.

## Goal figures

- `completed` and `milestonesCompleted` count goals and milestones whose completion instant
  falls inside the period (from the first instant of its first day to the first instant of
  the day after its last, in the user's time zone).
- Each active goal is listed with its current progress and what moved during the period
  (milestones completed, linked tasks finished).
- **Pace** compares progress with time. `expected` is the share of the time from the goal's
  start date to its target date that has passed, in percent. A goal is `on_track` within ten
  points of that, `ahead` above, `behind` below. Without a target date there is no pace.
  This is a plain linear yardstick, stated as such in the interface — not a forecast.

## Highlights

The written "period report" is a list of observations. Each one is produced by a fixed rule
in `analytics-highlights.js`; the API returns the rule's `kind` and the numbers behind it
(`params`), and clients phrase it in the user's language and can show the rule. At most six
are returned.

| Kind                                          | Shown when                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `habit_rate_up` / `habit_rate_down`           | both periods have ≥ 5 judged days and the rates differ by ≥ 5 points                             |
| `top_habit`                                   | ≥ 2 habits have ≥ 3 judged days; the best one is at ≥ 80%                                        |
| `struggling_habit`                            | a habit with ≥ 3 judged days is below 50%; the lowest is named                                   |
| `best_weekday` / `weakest_weekday`            | not for a single week; ≥ 3 weekdays have ≥ 3 due days and best and weakest are ≥ 15 points apart |
| `tasks_on_time`                               | ≥ 5 finished tasks had a due date                                                                |
| `tasks_completed_up` / `tasks_completed_down` | the period is over, the previous one had finished tasks, and the counts differ                   |
| `most_productive_day`                         | one day alone has the most finished tasks, and at least 3                                        |
| `goals_completed` / `milestones_completed`    | at least one in the period                                                                       |

A rule that lacks the data it needs stays silent. An empty list is a valid answer.

## Client

The web screen (`apps/web/src/pages/analytics`) shows the key figures, the report, three
charts, the per-habit table, the task breakdown and the goal list. Every chart is a single
series with a caption that says what its bars mean, a hover card with exact values, and the
same numbers as a table for screen readers. The series of the period can be downloaded as
CSV, and the page has a print layout.

Performance: one request reads the user's habits with their entries for the two periods, the
finished and due tasks of the range (three indexed queries) and the goals. Nothing is
cached; a year for an account with a few dozen habits is evaluated in memory in
milliseconds. Caching is revisited in Phase 16 if measurements call for it.
