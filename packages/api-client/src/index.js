import { createHttpClient } from './http.js';

export { ApiError, CLIENT_ERROR_CODES } from './errors.js';
export { EventSequencer } from './event-sequencer.js';
export { createHttpClient } from './http.js';
export { createRealtime } from './realtime.js';
export { createMemoryTokenStore } from './token-store.js';

/**
 * Creates a client for the Personalitify API.
 *
 * The client is independent of any UI framework and of the browser: pass a `fetch`
 * implementation and a token store and it works in Node.js or any other JavaScript runtime.
 * Each namespace mirrors a section of the API reference (docs/api/openapi.json).
 *
 * @param {Parameters<typeof createHttpClient>[0]} options
 */
export function createApiClient(options) {
  const http = createHttpClient(options);
  const { tokenStore } = http;

  /** Stores the token set returned by register/login and passes the result through. */
  const signedIn = (result) => {
    tokenStore.setTokens(result.tokens);
    return result;
  };

  return {
    http,
    tokenStore,

    health: {
      get: () => http.get('/health', { auth: false }),
    },

    auth: {
      register: async (input) =>
        signedIn(await http.post('/auth/register', input, { auth: false })),
      login: async (input) => signedIn(await http.post('/auth/login', input, { auth: false })),
      /** Restores a session from the refresh token (cookie or stored token). */
      refresh: () => http.refresh(),
      logout: async () => {
        try {
          await http.post('/auth/logout');
        } finally {
          tokenStore.clear();
        }
      },
      logoutAll: async () => {
        try {
          return await http.post('/auth/logout-all');
        } finally {
          tokenStore.clear();
        }
      },
      verifyEmail: (token) => http.post('/auth/verify-email', { token }, { auth: false }),
      resendVerification: () => http.post('/auth/resend-verification'),
      forgotPassword: (email) => http.post('/auth/forgot-password', { email }, { auth: false }),
      resetPassword: (input) => http.post('/auth/reset-password', input, { auth: false }),
      changePassword: (input) => http.post('/auth/change-password', input),
      listSessions: () => http.get('/auth/sessions'),
      revokeSession: (sessionId) => http.delete(`/auth/sessions/${sessionId}`),
    },

    users: {
      me: () => http.get('/users/me'),
      updateProfile: (patch) => http.patch('/users/me/profile', patch),
    },

    notifications: {
      /** Newest first; `meta.unread` is the total number of unread notifications. */
      list: (query) => http.list('/notifications', query),
      unreadCount: () => http.get('/notifications/unread-count'),
      markRead: (notificationId) => http.post(`/notifications/${notificationId}/read`),
      markUnread: (notificationId) => http.post(`/notifications/${notificationId}/unread`),
      markAllRead: () => http.post('/notifications/read-all'),
      remove: (notificationId) => http.delete(`/notifications/${notificationId}`),
    },

    settings: {
      get: () => http.get('/settings'),
      update: (patch) => http.patch('/settings', patch),
    },

    categories: {
      list: () => http.get('/categories'),
      create: (input) => http.post('/categories', input),
      update: (categoryId, patch) => http.patch(`/categories/${categoryId}`, patch),
      remove: (categoryId) => http.delete(`/categories/${categoryId}`),
    },

    habits: {
      list: (query) => http.get('/habits', { query }),
      get: (habitId) => http.get(`/habits/${habitId}`),
      create: (input) => http.post('/habits', input),
      update: (habitId, patch) => http.patch(`/habits/${habitId}`, patch),
      remove: (habitId) => http.delete(`/habits/${habitId}`),
      archive: (habitId) => http.post(`/habits/${habitId}/archive`),
      unarchive: (habitId) => http.post(`/habits/${habitId}/unarchive`),
      /** Habits of one day; omit `date` for today in the user's time zone. */
      day: (date) => http.get('/habits/day', { query: { date } }),
      history: (habitId, range) => http.get(`/habits/${habitId}/history`, { query: range }),
      stats: (habitId) => http.get(`/habits/${habitId}/stats`),
      /** Records progress, a skip, a postponement or a note for a day. */
      setEntry: (habitId, date, input) => http.put(`/habits/${habitId}/entries/${date}`, input),
      clearEntry: (habitId, date) => http.delete(`/habits/${habitId}/entries/${date}`),
    },

    focus: {
      /** The active session, timer lengths, today's focus time and the server clock. */
      state: () => http.get('/focus'),
      stats: ({ from, to }) => http.get('/focus/stats', { query: { from, to } }),
      sessions: (query) => http.list('/focus/sessions', query),
      /** Starts the timer now; fails with INVALID_STATE while another session is active. */
      start: (input) => http.post('/focus/sessions', input),
      get: (sessionId) => http.get(`/focus/sessions/${sessionId}`),
      update: (sessionId, patch) => http.patch(`/focus/sessions/${sessionId}`, patch),
      pause: (sessionId) => http.post(`/focus/sessions/${sessionId}/pause`),
      resume: (sessionId) => http.post(`/focus/sessions/${sessionId}/resume`),
      complete: (sessionId) => http.post(`/focus/sessions/${sessionId}/complete`),
      cancel: (sessionId) => http.post(`/focus/sessions/${sessionId}/cancel`),
      remove: (sessionId) => http.delete(`/focus/sessions/${sessionId}`),
    },

    goals: {
      list: (query) => http.get('/goals', { query }),
      /** A goal with its sub-goals and linked habits. */
      get: (goalId) => http.get(`/goals/${goalId}`),
      create: (input) => http.post('/goals', input),
      update: (goalId, patch) => http.patch(`/goals/${goalId}`, patch),
      remove: (goalId) => http.delete(`/goals/${goalId}`),
      history: (goalId) => http.get(`/goals/${goalId}/history`),
      addMilestone: (goalId, input) => http.post(`/goals/${goalId}/milestones`, input),
      updateMilestone: (goalId, milestoneId, patch) =>
        http.patch(`/goals/${goalId}/milestones/${milestoneId}`, patch),
      removeMilestone: (goalId, milestoneId) =>
        http.delete(`/goals/${goalId}/milestones/${milestoneId}`),
      addReview: (goalId, input) => http.post(`/goals/${goalId}/reviews`, input),
      removeReview: (goalId, reviewId) => http.delete(`/goals/${goalId}/reviews/${reviewId}`),
    },

    tasks: {
      /** Paginated; `meta.today` is today in the user's time zone. */
      list: (query) => http.list('/tasks', query),
      /** Overdue, due and completed tasks of one day; omit `date` for today. */
      day: (date) => http.get('/tasks/day', { query: { date } }),
      get: (taskId) => http.get(`/tasks/${taskId}`),
      create: (input) => http.post('/tasks', input),
      update: (taskId, patch) => http.patch(`/tasks/${taskId}`, patch),
      remove: (taskId) => http.delete(`/tasks/${taskId}`),
      /** Returns `{ task, next }`; `next` is the new occurrence of a repeating task. */
      complete: (taskId) => http.post(`/tasks/${taskId}/complete`),
      reopen: (taskId) => http.post(`/tasks/${taskId}/reopen`),
      postpone: (taskId, to) => http.post(`/tasks/${taskId}/postpone`, { to }),
      addSubtask: (taskId, title) => http.post(`/tasks/${taskId}/subtasks`, { title }),
      updateSubtask: (taskId, subtaskId, patch) =>
        http.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, patch),
      removeSubtask: (taskId, subtaskId) => http.delete(`/tasks/${taskId}/subtasks/${subtaskId}`),
    },

    calendar: {
      /**
       * The unified calendar between two dates: events, tasks and habits as display-ready
       * items in the user's time zone, plus the pairs of items that overlap.
       */
      get: ({ from, to, include }) =>
        http.get('/calendar', { query: { from, to, include: include?.join(',') } }),
      getEvent: (eventId) => http.get(`/calendar/events/${eventId}`),
      /** Returns `{ event, conflicts }`. */
      createEvent: (input) => http.post('/calendar/events', input),
      updateEvent: (eventId, patch) => http.patch(`/calendar/events/${eventId}`, patch),
      removeEvent: (eventId) => http.delete(`/calendar/events/${eventId}`),
      /** Reschedules by day and time; a repeating event needs `occurrenceDate`. */
      moveEvent: (eventId, input) => http.post(`/calendar/events/${eventId}/move`, input),
      removeOccurrence: (eventId, date) =>
        http.delete(`/calendar/events/${eventId}/occurrences/${date}`),
    },

    achievements: {
      /** XP, level, every achievement with its progress, and the latest XP earned. */
      get: () => http.get('/achievements'),
    },

    analytics: {
      /** Statistics of the week, month, quarter or year that contains `date` (default: today). */
      overview: ({ period, date } = {}) =>
        http.get('/analytics/overview', { query: { period, date } }),
    },

    dashboard: {
      /** Everything the personal dashboard shows, in one request. */
      get: () => http.get('/dashboard'),
    },

    journal: {
      /** Entries without bodies; `q` searches title, text and tags. */
      list: (query) => http.list('/journal', query),
      tags: () => http.get('/journal/tags'),
      create: (input) => http.post('/journal', input),
      get: (entryId) => http.get(`/journal/${entryId}`),
      update: (entryId, patch) => http.patch(`/journal/${entryId}`, patch),
      remove: (entryId) => http.delete(`/journal/${entryId}`),
      revisions: (entryId) => http.get(`/journal/${entryId}/revisions`),
      restoreRevision: (entryId, revisionId) =>
        http.post(`/journal/${entryId}/revisions/${revisionId}/restore`),
    },

    mood: {
      /** Entries of a range with their statistics. */
      range: ({ from, to }) => http.get('/mood', { query: { from, to } }),
      set: (date, input) => http.put(`/mood/${date}`, input),
      clear: (date) => http.delete(`/mood/${date}`),
    },

    events: {
      /** Events after a sequence number, in order: `{ items, meta: { headSeq, hasMore } }`. */
      list: ({ after, limit } = {}) => http.list('/events', { after, limit }),
    },

    devices: {
      list: () => http.get('/devices'),
      current: () => http.get('/devices/current'),
      update: (deviceId, patch) => http.patch(`/devices/${deviceId}`, patch),
      remove: (deviceId) => http.delete(`/devices/${deviceId}`),
    },

    account: {
      exportData: () => http.get('/account/export'),
      securityLog: (query) => http.list('/account/security-log', query),
      delete: async (password) => {
        await http.delete('/account', { password });
        tokenStore.clear();
      },
    },
  };
}
