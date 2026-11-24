# Changelog

All notable changes to Personalitify are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Phase 0: architecture overview, architecture decision records, roadmap and contribution
  guide.
- Phase 1: npm workspaces monorepo (`apps/api`, `apps/web`, `packages/localization`,
  `packages/shared-contracts`); Express API bootstrap with validated environment
  configuration, structured logging, MongoDB connection handling and health endpoints;
  React + Vite + Tailwind web shell; ESLint, Prettier and Vitest; GitHub Actions CI;
  one-command local development with automatic `.env` creation; bilingual setup and
  troubleshooting guides.
- Phase 2: backend core and security — centralized error handling with stable codes and
  localized messages, schema-validated routes that generate the OpenAPI document, security
  headers, CORS allowlist, rate limiting and NoSQL-injection guard; registration, sign-in,
  rotating refresh tokens with reuse detection, sessions, devices, email verification and
  password reset; profile and settings as synchronized entities; the versioned entity
  service with optimistic concurrency, field-level merge, tombstones and an atomic outbox
  relayed to a per-user event log; account export and deletion; security audit log.
- Phase 3: web client foundation — design system with color, type, radius, shadow and motion
  tokens in light and dark themes; reusable accessible components (buttons, form fields,
  modal, menu, tooltip, toasts, skeletons, empty and error states); responsive application
  shell with sidebar, mobile drawer and top bar; Turkish and English interface with
  remembered language and theme; sign-in, registration, password reset and email
  verification screens; settings for profile, appearance, date and time, notifications,
  privacy, security, devices and account deletion; `@personalitify/api-client`, a
  framework-free SDK with single-flight token refresh.
- Phase 4: habits and routines — habits with fixed schedules (daily, every N days, chosen
  weekdays, days of the month, yearly) or flexible weekly/monthly quotas; check, count and
  duration targets; start and end dates, reminders, streak goals, colors, icons and shared
  categories; per-day entries with progress, skip, postpone and notes; streaks, completion
  rates and weekday breakdowns derived on request; a day view, a management view and a
  detail view with a history grid in the web client. Calendar-date and recurrence rules are
  documented as a platform contract and evaluated in the user's time zone.
- Phase 5: goals and tasks — short- and long-term goals with four ways of measuring progress
  (own estimate, milestones, linked tasks, a number), milestones, sub-goals, linked habits,
  dated reviews and a change history; tasks with priorities, start and due dates, planned
  time blocks, subtasks, repeating series, postponing that remembers the first due date, a
  day view with overdue tasks, search and filters; goal and task screens in the web client.
- Phase 6: calendar and planning — events and time blocks stored as wall-clock times in
  their own time zone, repeating events with removable occurrences, reminders and links; a
  unified calendar that merges events, tasks and habits into display-ready items in the
  user's time zone; overlap detection; rescheduling by day and time; month, week and day
  views in the web client with drag-and-drop.
- Phase 7: personal dashboard — one aggregation endpoint with today's progress, habits and
  tasks, upcoming entries, active goals, the last seven days compared with the week before,
  streaks, recent activity and rule-based insights that state how they were determined;
  widgets that can be rearranged, hidden and restored, with the layout stored in the
  account.
- Phase 8: analytics — statistics of a week, month, quarter or year next to the period
  before: habit completion rates over time and by weekday, every habit in its own unit, task
  punctuality and breakdowns, goal pace against time, and a written period report whose
  every line names its rule. Charts come with explanations, exact values on hover and a
  table for screen readers; the series can be exported as CSV and the page printed.
- Phase 9: focus timer, journal and mood — a timer for focus sessions and breaks whose
  times are kept by the server (one active session per account, pause and resume, automatic
  completion, adjustable lengths, daily and weekly focus time); journal entries and notes in
  Markdown with tags, accent-insensitive search, pinning and a restorable history of earlier
  versions; a daily mood entry with feelings and a note, a month calendar and statistics.

### Fixed

- Days after a habit was archived are no longer counted as missed in the dashboard's weekly
  figures.
- Tables provided for screen readers could make a page scroll sideways on narrow screens.
- Session restore no longer shares the strict rate limit of the credential endpoints, which
  locked users out after a few page reloads.
- An event subscriber that wrote another entity of the same user deadlocked on the per-user
  relay queue; subscribers now run after the relay has left the queue.
