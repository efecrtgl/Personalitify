import { createApiClient } from '@personalitify/api-client';
import { QueryClient } from '@tanstack/react-query';
import { i18n } from './i18n.js';

const sessionEndedListeners = new Set();

/** Subscribes to the moment the server ends the session (revoked, expired, reused token). */
export function onSessionEnded(listener) {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/**
 * Refresh tokens are single-use and shared by every tab through the cookie, so tabs take
 * turns refreshing. Without the Web Locks API each tab simply refreshes on its own.
 */
function refreshLock(task) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('pfy-token-refresh', task);
  }
  return task();
}

/** The one API client of the web application. */
export const api = createApiClient({
  // Resolved on every call so the client always uses the current global fetch.
  fetch: (...args) => globalThis.fetch(...args),
  credentials: 'include',
  getLanguage: () => i18n.language,
  refreshLock,
  onSessionEnded: (code) => {
    for (const listener of sessionEndedListeners) listener(code);
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Client errors will not succeed on retry; only transient failures are retried.
      retry: (failureCount, error) =>
        failureCount < 2 && (error?.isNetworkError || (error?.status ?? 0) >= 500),
    },
    mutations: { retry: false },
  },
});

/** Cache keys shared across the application. */
export const queryKeys = {
  me: ['me'],
  sessions: ['auth', 'sessions'],
  devices: ['devices'],
  securityLog: (page) => ['account', 'security-log', page],
  categories: ['categories'],
  dashboard: ['dashboard'],
  analytics: {
    all: ['analytics'],
    overview: (period, date) => ['analytics', 'overview', period, date ?? 'current'],
  },
  calendar: {
    all: ['calendar'],
    range: (from, to, include) => ['calendar', 'range', from, to, include],
    event: (eventId) => ['calendar', 'event', eventId],
  },
  goals: {
    all: ['goals'],
    list: (filter) => ['goals', 'list', filter],
    detail: (goalId) => ['goals', 'detail', goalId],
    history: (goalId) => ['goals', 'detail', goalId, 'history'],
  },
  tasks: {
    all: ['tasks'],
    day: (date) => ['tasks', 'day', date ?? 'today'],
    list: (filter) => ['tasks', 'list', filter],
  },
  habits: {
    all: ['habits'],
    list: (archived) => ['habits', 'list', archived],
    day: (date) => ['habits', 'day', date ?? 'today'],
    detail: (habitId) => ['habits', 'detail', habitId],
    stats: (habitId) => ['habits', 'detail', habitId, 'stats'],
    history: (habitId, from, to) => ['habits', 'detail', habitId, 'history', from, to],
  },
};
