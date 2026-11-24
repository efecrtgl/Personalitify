# Phase 6 — Calendar and Planning

## Objective

Give the user one calendar for everything that has a time: their own events and time blocks,
their planned tasks and their habits — correct across time zones, and reschedulable by
dragging.

## Implemented

### Calendar events (API)

- Events and time blocks with title, location, notes, category, color, reminders and
  optional links to a task, a habit or a goal.
- Timed events are stored as wall-clock times in the event's own time zone; all-day events
  as plain calendar dates, optionally spanning several days.
- Repeating events (the platform's recurrence rules) with an end date and removable
  occurrences.
- `GET /calendar`: the **unified calendar** for a range of up to 62 days — every occurrence
  of every event, tasks by their time block or else their due date, habits on the days they
  are due — as display-ready items in the user's time zone, plus the pairs of timed items
  that overlap.
- Rescheduling (`POST /calendar/events/{id}/move`) by the day and time the viewer sees,
  keeping the event's length. Moving one occurrence of a series detaches it into an event of
  its own.
- Saving an event reports the other entries it overlaps in the coming weeks, as a warning.

### Calendar (web)

- A reusable calendar module (`apps/web/src/calendar`): pure layout calculations, a month
  grid, a time grid used for both week and day, and draggable items.
- Month, week and day views with previous/next/today navigation, kept in the URL.
- Filters for events, tasks and habits.
- Event form with all-day switch, dates and times, repeat rules, location, reminder,
  category and color. Editing a repeating event changes the series; a single occurrence can
  be deleted from the editor.
- Clicking a day or a time slot starts a new event there; clicking a task opens the task
  form; clicking a habit opens the habit.
- Drag-and-drop: events to another day or time (calendar API), tasks to another day or time
  (their time block). Overlapping entries are drawn side by side and marked.

## Architectural decisions

- **Wall-clock time plus zone instead of instants.** "10:00 Europe/Istanbul" keeps a weekly
  meeting at 10:00 through daylight-saving changes. Instants are derived per occurrence.
- **The server positions items for the viewer.** Every calendar item carries its dates and
  times in the user's current time zone as well as its instants, so a client — including the
  future Rust client — needs no time zone database to draw a calendar.
- **A repeating event is one document; a repeating task is many.** Event occurrences carry
  no state, so they are expanded on request. Task occurrences have state and are stored.
- **Conflicts are information, not errors.** People double-book on purpose; the API reports
  overlaps and never refuses them.
- **Dragging a repeating event moves one occurrence.** Changing a whole series by dragging
  is ambiguous (which weekday rule should follow?); the series is edited in the form.
- **Dragging is a shortcut.** Everything that can be dragged can also be changed by opening
  the item, so keyboard and touch users are not excluded.

## Problems found and fixed during the phase

- **The development API could collide with itself when restarting.** The dev log showed a
  restart failing with "port already in use": idle keep-alive connections kept the listening
  socket open during shutdown. The server now closes idle connections when shutting down.

## Important files

`apps/api/src/modules/calendar/{calendar-event.model,calendar-items,calendar.service,calendar.routes}.js`,
`apps/web/src/calendar/{layout.js,CalendarItem.jsx,MonthView.jsx,TimeGridView.jsx}`,
`apps/web/src/pages/calendar/{CalendarPage,EventFormModal}.jsx`,
`packages/localization/locales/{tr,en}/calendar.json`,
`docs/architecture/time-and-recurrence.md` (new section "Calendar events").

## Database changes

New collection `calendarEvents` (entity type `calendarEvent`). Fields, indexes and design
notes are in [`docs/architecture/database.md`](../architecture/database.md); the reference
table now includes calendar events.

## API changes

7 new operations in the group Calendar. See
[`docs/api/openapi.json`](../api/openapi.json).

## Tests executed

| Suite                         | Result                |
| ----------------------------- | --------------------- |
| `@personalitify/api`          | 208 passed (14 files) |
| `@personalitify/web`          | 78 passed (9 files)   |
| `@personalitify/api-client`   | 15 passed (1 file)    |
| `@personalitify/localization` | 5 passed (1 file)     |

New backend tests (20):

- **Calendar items** (8): an event positioned in the viewer's zone; an event landing on the
  neighbouring day in another zone; all-day events never shifting; a series with end date
  and removed occurrences; a series keeping its wall-clock time across a daylight-saving
  change (and appearing to move for a viewer whose clocks did not change); events past
  midnight; tasks by time block or due date; overlap detection (touching ends, finished
  tasks, all-day items and habits excluded).
- **Calendar API** (12): defaults in the user's zone; eight invalid timings; the merged feed
  of events, tasks and habits; range limits; the same event shown in the user's zone before
  and after changing it; conflicts in the feed and on save; series occurrences, removal and
  ending; detaching a dragged occurrence; moving with kept length and past midnight; drop
  position interpreted in the viewer's zone for an event from another zone; all-day moves;
  unlinking and ownership.

New web tests (13): month weeks for different week starts; ranges and neighbours of each
view; time conversion and snapping; splitting a day; side-by-side layout of overlaps;
clipping of multi-day items; month view with items and the requested range; navigation,
view switch and opening a day; filters; creating an event with a conflict warning; conflict
marker and drag-and-drop of an event; rescheduling a task by drop; editing a series and
deleting one occurrence.

Also passing: `npm run lint`, `npm run format:check`.

Manual verification: events (including two weekly series, a multi-day all-day event and two
overlapping events), tasks and a habit were seeded through the public API and the month,
week and day views and the event form were captured in a headless browser, with no console
errors or warnings.

## Build results

`npm run build` succeeded: 747.5 kB JavaScript (227.2 kB gzip).

## Known limitations

- Drag-and-drop uses the browser's native drag events, which touch screens do not provide;
  on touch devices items are rescheduled through their forms.
- An event cannot be resized by dragging its edge.
- One reminder per event can be chosen in the web form (the API accepts up to five);
  reminders are delivered from Phase 11.
- The month view lists habits on every due day, which is dense for daily habits; they can
  be switched off with the filter.
- Editing "this and following occurrences" of a series is not supported.

## Git

| Commit    | Message                                             |
| --------- | --------------------------------------------------- |
| `87b75f3` | fix(api): release idle connections on shutdown      |
| `fe06d3b` | feat(calendar): add recurring events and scheduling |
| `f041071` | feat(api-client): add calendar endpoints            |
| `750afad` | feat(web): add month, week and day calendar views   |
| `d2875ad` | docs: record phase 6 in changelog and roadmap       |

Push status: pushed to `origin/main` and verified (`origin/main` = `d2875ad`).
GitHub Actions: the CI workflow completed successfully for `d2875ad` on Node 22 and Node 24.

## Next phase

Phase 7 — Personal dashboard.
