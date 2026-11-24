import { createHttpClient } from './http.js';

export { ApiError, CLIENT_ERROR_CODES } from './errors.js';
export { createHttpClient } from './http.js';
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
