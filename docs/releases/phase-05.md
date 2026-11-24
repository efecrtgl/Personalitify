# Phase 5 — Goals and Tasks

## Objective

Let users set goals, break them into milestones, sub-goals and tasks, and manage the tasks
of every day — including repeating tasks and tasks that slip.

## Implemented

### Goals (API)

- Short- and long-term goals with description, category, color, icon, start and target
  dates, and the statuses active, paused, completed and abandoned.
- Four progress modes: own estimate (`manual`), share of completed milestones, share of
  completed linked tasks, or a number against a target (`metric`).
- Milestones and dated reviews as bounded embedded lists with their own endpoints. A review
  records the goal's progress at the moment it is written.
- Sub-goals up to three levels deep, with cycle detection; linked habits.
- Derived figures in every response (`computed`: percent, milestone and task counts, days
  left, overdue), calculated on read and not part of the synchronized resource.
- Change history from the event log.

### Tasks (API)

- Priorities, start and due dates with optional time, planned time blocks (day, time,
  duration), subtasks, categories, links to a goal and a habit.
- Statuses `todo`, `in_progress`, `done`, `cancelled`; completion records both the instant
  and the user's calendar date.
- **Repeating tasks** as series of separate tasks: completing an occurrence creates the
  next one with shifted dates and a fresh checklist.
- **Postponing** to a later day; the first due date and the number of moves are kept.
- Day view: overdue tasks (for the user's today), tasks due or scheduled on the day, tasks
  completed on it.
- Lists with status, priority, category, goal, habit and due-range filters, literal title
  search, four sort orders and pagination.

### Web client

- Tasks: Today (quick add, overdue, due, completed), Upcoming (next 14 days grouped by day),
  All (dated and undated, search), Completed; row actions for completing, moving and
  deleting; a form with dates, repeat rules, time block, subtasks and links.
- Goals: card grid with progress bars, deadlines and counts, filterable by status; a form
  covering all progress modes; a detail screen with a progress control suited to the mode,
  milestones, the goal's tasks with quick add, sub-goals, supporting habits, reviews and
  recent changes.

## Architectural decisions

- **References are detached by subscribers, not by cascades.** `detachOnDelete` registers
  one subscriber per reference; the cleanup is an ordinary versioned change of the referring
  entity and therefore synchronizes to other devices.
- **A repeating task is a series of individual tasks** rather than one task with virtual
  occurrences. Each occurrence has real history, and "what did I complete" stays a plain
  query. A unique index on series and due date makes creating the next occurrence
  idempotent.
- **Derived goal figures are kept out of the resource.** The synchronized `goal` contains
  only what the user entered; `computed` is added to API responses.
- **Milestones, reviews and subtasks have dedicated endpoints** so two devices changing
  different entries do not have to send (and fight over) the whole list.

## Problems found and fixed during the phase

- **Sub-goals could not be created.** The cycle check compared each ancestor's parent with
  the id of the goal being saved, which is `null` for a new goal — and a top-level parent
  has a `null` parent too. Found by the first sub-goal test.
- **Unstable order of same-priority tasks** in the day view; a final tie-break by title was
  added.

## Important files

`apps/api/src/core/entity/references.js`,
`apps/api/src/modules/goals/{goal.model,goals.service,goals.routes}.js`,
`apps/api/src/modules/tasks/{task.model,tasks.service,tasks.routes}.js`,
`packages/shared-contracts/src/planning.js`, `apps/web/src/pages/goals/*`,
`apps/web/src/pages/tasks/*`, `apps/web/src/lib/recurrenceForm.js`,
`packages/localization/locales/{tr,en}/{goals,tasks}.json`.

## Database changes

New collections `goals` and `tasks`, both synchronized entities. Fields, indexes, design
notes and the table of references are in
[`docs/architecture/database.md`](../architecture/database.md).

## API changes

25 new operations: Goals (11) and Tasks (14). See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 188 passed (13 files) |
| `@personalitify/web`          | 65 passed (8 files)   |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (35):

- **Goals** (15): progress by mode and with nothing to measure; defaults and derived
  figures; eight invalid inputs; metric progress, completing and reopening; status and
  horizon filters with overdue; milestone lifecycle; two devices ticking different
  milestones at once; progress from linked tasks; linked habits and their removal on
  delete; nesting, cycles and depth; what survives a deleted goal; reviews; history;
  ownership.
- **Tasks** (20): defaults; full definitions with client id; eleven invalid inputs; filters,
  literal search, sorting and pagination; completion with the user's calendar date; status
  through update; next occurrence of a series; no duplicates on re-completion or concurrent
  completion; end date and removed recurrence; making a task repeat; postponing with first
  due date; direct date edits; undated tasks; subtasks; day view sections and order; other
  days; overdue by time zone; unlinking on delete; ownership; export.

New web tests (11): task day view with optimistic completion, quick add, move and delete,
repeating task with subtasks from the form, upcoming grouping, search; goal list figures and
filter, goal creation with a metric, milestone tick, new milestone and review, marking a
goal achieved with its version, adding a task to a goal, missing goal.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification: goals, milestones, reviews, sub-goals and tasks were seeded through the
public API and the web client was driven in a headless browser (task day view, goal list,
goal detail, task form) with no console errors or warnings. The seed script's first run was
rejected by the API for a target date before the start date, which is the intended
validation.

## Build results

`npm run build` succeeded: 722.8 kB JavaScript (220.3 kB gzip).

## Known limitations

- A sub-goal's progress does not roll up into its parent automatically.
- Moving one occurrence of a repeating task onto a day where another occurrence of the same
  series is due is refused (`409 CONFLICT`).
- Task reminders are part of the notification engine (Phase 11).
- The task lists load at most 100 items per view.

## Git

| Commit    | Message                                                         |
| --------- | --------------------------------------------------------------- |
| `c1f23d9` | refactor(core): share reference detachment between modules      |
| `7471eda` | feat(goals): add goals with milestones, sub-goals and reviews   |
| `9d3d858` | feat(tasks): add tasks with subtasks, recurrence and postponing |
| `12becdd` | feat(api-client): add goal and task endpoints                   |
| `d339273` | feat(web): add task and goal screens                            |
| `7b85cae` | docs: record phase 5 in changelog and roadmap                   |

Push status: pushed to `origin/main` and verified (`origin/main` = `7b85cae`).
GitHub Actions: the CI workflow completed successfully for `7b85cae` on Node 22 and Node 24.

## Next phase

Phase 6 — Calendar and planning.
