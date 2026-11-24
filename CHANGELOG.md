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

### Fixed

- Session restore no longer shares the strict rate limit of the credential endpoints, which
  locked users out after a few page reloads.
- An event subscriber that wrote another entity of the same user deadlocked on the per-user
  relay queue; subscribers now run after the relay has left the queue.
