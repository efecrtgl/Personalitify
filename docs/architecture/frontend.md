# Web Client Architecture

The web client (`apps/web`) is one of several clients of the Personalitify backend. It
contains presentation and interaction only; every rule about data lives in the API.

## Stack

React 19 · Vite · Tailwind CSS 4 · React Router · TanStack Query · i18next · Lucide icons ·
Motion. JavaScript only.

## Layers

```
src/
├─ ui/          Design-system primitives. Know nothing about the product.
├─ layout/      Application frame: shell, sidebar, top bar, auth frame.
├─ providers/   Theme and session state.
├─ hooks/       Shared behaviour: forms, account mutations.
├─ lib/         API client instance, i18n, formatting, storage, device identity.
└─ pages/       One directory per area of the product.
```

Dependencies point downward only: pages use layout, hooks and ui; `ui/` depends on nothing
but the small presentation helpers in `lib/` (class names, the icon map).

## Talking to the backend

The client never calls `fetch` directly. `lib/api.js` creates one instance of
`@personalitify/api-client`, the same framework-free SDK any other JavaScript client can use.

- The access token lives in memory only.
- The refresh token is an `HttpOnly` cookie that JavaScript cannot read; requests are sent
  with `credentials: 'include'`.
- On start the client restores the session by calling `/auth/refresh`.
- Refresh tokens are single-use and the cookie is shared by all tabs, so refreshes are
  serialized across tabs with the Web Locks API.
- When the server ends the session, the SDK reports it once and the app returns to the
  sign-in screen with an explanation.

Server state is held in the TanStack Query cache. The signed-in user (`user`, `profile`,
`settings`) is one cache entry (`queryKeys.me`), so an edit anywhere updates every screen.

### Optimistic updates with versions

`hooks/useAccount.js` implements the pattern used for synchronized resources:

1. Apply the change to the cache immediately.
2. Send it with `baseVersion` taken from the cache at send time. Mutations of the same
   resource run one after another, so each carries the version the previous one produced.
3. On success, store the server's resource (and its new version).
4. On failure, restore the previous state. A `VERSION_CONFLICT` reloads the server state and
   tells the user their other device got there first.

### The dashboard

The dashboard is one request (`GET /dashboard`) and one cache entry. Its figures summarize
every module, so `AppProviders` watches the mutation cache and marks the dashboard stale
after any successful change, instead of each module having to know that a dashboard
exists. The widget layout is not part of the dashboard response: it lives in
`settings.dashboard.widgets` and therefore follows the user to every device.

## Design system

### Tokens

All visual constants are CSS custom properties in `src/index.css`, exposed to Tailwind as
semantic names. Components never use raw colors.

| Group      | Tokens                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Surfaces   | `canvas`, `surface`, `surface-2`, `surface-3`, `overlay`                |
| Lines      | `line`, `line-strong`                                                   |
| Text       | `ink`, `ink-2`, `ink-3`                                                 |
| Accent     | `accent`, `accent-hover`, `accent-soft`, `on-accent`                    |
| Status     | `success`, `warning`, `danger` (+ `-soft`, `danger-hover`, `on-danger`) |
| Radius     | `control` (10px), `card` (16px), `sheet` (20px)                         |
| Shadow     | `card`, `raised`, `pop`                                                 |
| Type scale | `display`, `title`, `heading`, `body`, `caption`                        |
| Motion     | `ease-standard`                                                         |

The light and dark themes redefine the same properties, so a component is themed without any
theme-specific code.

### Themes

`ThemeProvider` holds the preference (`system`, `light`, `dark`), resolves it against the
operating system, and writes the result to `<html data-theme>`. The preference is stored

- in `localStorage`, so the correct theme is applied before sign-in and, through a small
  inline script in `index.html`, before the first paint;
- in the account settings, so it follows the user to other devices.

### Components

| File             | Components                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| `Button.jsx`     | `Button`, `IconButton` (variants: primary, secondary, ghost, danger)                  |
| `LinkButton.jsx` | A link with the appearance of a button                                                |
| `fields.jsx`     | `Field`, `Input`, `Textarea`, `PasswordInput`, `Select`, `Switch`, `SegmentedControl` |
| `overlays.jsx`   | `Modal`, `ConfirmDialog`, `Menu`, `Tooltip`                                           |
| `feedback.jsx`   | `Spinner`, `Skeleton`, `SkeletonList`, `EmptyState`, `ErrorState`, `Banner`           |
| `display.jsx`    | `Card`, `Panel`, `PageHeader`, `Avatar`, `Badge`, `Row`                               |
| `toast.jsx`      | `ToastProvider`, `useToast`                                                           |

Every data-driven view has three explicit states besides its content: loading (skeletons in
the shape of the content), empty (what it is and what to do next) and error (with a retry).

### Accessibility

- Native elements first: `<dialog>` for modals and the mobile drawer (focus trap, Escape,
  inert background), `<select>` for simple choices, radio inputs behind segmented controls.
- `Field` wires label, hint and error to the control (`aria-describedby`, `aria-invalid`);
  errors are announced.
- `Menu` implements the menu-button keyboard pattern.
- One visible focus indicator for keyboard users everywhere.
- After navigation, focus moves to the page content; a skip link precedes the navigation.
- `prefers-reduced-motion` disables transitions and animations globally.
- Icon-only buttons require a label.

## Internationalization

All text comes from `packages/localization` through i18next; components contain no literal
user-facing strings. Turkish is the default, English the second language.

- The language is stored like the theme: locally for instant start, in the account for
  other devices. The account's language wins after sign-in.
- Dates, times, numbers and relative times are formatted by `lib/format.js` from the user's
  settings: interface language, IANA time zone, 12/24-hour clock and day-month-year order.
  The browser's own zone is never assumed.
- Validation messages shown by the browser reuse the API's catalog (`errors:validation.*`),
  so both sources read the same.

Two tests guard this: one compares the key sets of all languages, the other scans the web
source and fails on any translation key without a message in every language and on any
hardcoded sentence in JSX.

## Routing

| Path                                  | Access        |
| ------------------------------------- | ------------- |
| `/`                                   | signed in     |
| `/settings/:section`                  | signed in     |
| `/login`, `/register`                 | visitors only |
| `/forgot-password`, `/reset-password` | visitors only |
| `/verify-email`                       | anyone        |

Route guards exist for user experience only. Authorization is enforced by the API on every
request.

The sidebar is built from `layout/navigation.js`. A module adds its entry there when it
ships, so navigation never points at a screen that does not exist.

## Testing

Tests render the real route tree with a scripted `fetch`, so they exercise providers,
routing, the SDK and the components together and assert on what a user would see and on the
exact requests sent to the API.
