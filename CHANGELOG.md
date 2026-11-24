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

### Fixed

- Session restore no longer shares the strict rate limit of the credential endpoints, which
  locked users out after a few page reloads.
- Phase 3: web client foundation — design system with color, type, radius, shadow and motion
  tokens in light and dark themes; reusable accessible components (buttons, form fields,
  modal, menu, tooltip, toasts, skeletons, empty and error states); responsive application
  shell with sidebar, mobile drawer and top bar; Turkish and English interface with
  remembered language and theme; sign-in, registration, password reset and email
  verification screens; settings for profile, appearance, date and time, notifications,
  privacy, security, devices and account deletion; , a
  framework-free SDK with single-flight token refresh.

### Fixed

- Session restore no longer shares the strict rate limit of the credential endpoints, which
  locked users out after a few page reloads.
