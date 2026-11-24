import { DASHBOARD_WIDGETS } from '@personalitify/shared-contracts';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AppProviders, AppRoutes } from '../App.jsx';

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const ok = (data, meta) => json(200, meta ? { data, meta } : { data });
export const noContent = () => new Response(null, { status: 204 });
export const fail = (status, code, message = code, details) =>
  json(status, { error: { code, message, details, requestId: 'test-request' } });

/** A complete signed-in account as the API returns it. */
export function account(overrides = {}) {
  return {
    user: {
      id: 'user-1',
      email: 'ada@example.test',
      emailVerified: true,
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: '2026-11-24T08:00:00.000Z',
      ...overrides.user,
    },
    profile: {
      id: 'user-1',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      displayName: 'Ada',
      bio: '',
      avatarColor: '#0a84ff',
      ...overrides.profile,
    },
    settings: {
      id: 'user-1',
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      language: 'tr',
      theme: 'system',
      timeZone: 'Europe/Istanbul',
      dateFormat: 'dmy',
      timeFormat: '24h',
      weekStart: 1,
      notifications: {
        inApp: true,
        habitReminders: true,
        taskReminders: true,
        goalReminders: true,
        eventReminders: true,
        achievements: true,
        quietHours: { enabled: false, start: '22:00', end: '07:00' },
      },
      privacy: { hideSensitivePreviews: false },
      dashboard: {
        widgets: DASHBOARD_WIDGETS.map((id) => ({ id, visible: true })),
      },
      ...overrides.settings,
    },
  };
}

export const tokens = () => ({
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
  refreshToken: null,
  refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  sessionId: 'session-1',
  deviceId: 'device-1',
});

/**
 * Replaces `fetch` with a scripted API. `routes` maps `"METHOD /path"` (without the
 * `/api/v1` prefix) to a handler `(request) => Response`. Unknown requests fail the test.
 */
export function mockApi(routes) {
  const requests = [];
  const fetchMock = vi.fn(async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url, 'http://localhost');
    const path = pathname.replace('/api/v1', '');
    const request = {
      method: init.method ?? 'GET',
      path,
      query: Object.fromEntries(searchParams),
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: init.headers ?? {},
    };
    requests.push(request);
    const handler = routes[`${request.method} ${path}`];
    if (!handler) {
      throw new Error(`Unexpected API request in test: ${request.method} ${path}`);
    }
    return handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    requests,
    calls: (method, path) =>
      requests.filter((request) => request.method === method && request.path === path),
  };
}

/** Routes of a visitor without a session. */
export const anonymousRoutes = () => ({
  'POST /auth/refresh': () => fail(401, 'INVALID_REFRESH_TOKEN'),
});

/** An account's dashboard with nothing on it yet. */
export function emptyDashboard(overrides = {}) {
  const today = '2026-11-24';
  return {
    today,
    timeZone: 'Europe/Istanbul',
    habits: { summary: { due: 0, completed: 0, skipped: 0, postponed: 0, rate: null }, items: [] },
    tasks: {
      summary: { total: 0, done: 0, overdue: 0, open: 0 },
      overdue: [],
      due: [],
      completed: [],
    },
    upcoming: [],
    goals: [],
    week: {
      days: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-11-${18 + index}`,
        due: 0,
        completed: 0,
        tasksCompleted: 0,
      })),
      habits: { due: 0, completed: 0, rate: null, previousRate: null },
      tasksCompleted: 0,
      previousTasksCompleted: 0,
    },
    streaks: [],
    activity: [],
    insights: [],
    ...overrides,
  };
}

/** Routes of a browser that still has a valid refresh cookie. */
export const signedInRoutes = (me = account()) => ({
  'POST /auth/refresh': () => ok(tokens()),
  'GET /users/me': () => ok(me),
  'GET /dashboard': () => ok(emptyDashboard()),
  'GET /categories': () => ok([]),
  'GET /goals': () => ok([]),
});

/** Renders the real application routes at `path`. */
export function renderApp(path = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <AppProviders queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}
