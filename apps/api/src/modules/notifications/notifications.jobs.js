import { defineJob } from '../../core/jobs.js';
import { completeExpiredSessions } from '../focus/focus.service.js';
import { purgeOldNotifications } from './notifications.service.js';
import { runReminders } from './reminders.js';

/**
 * The background jobs of the API. Importing this module defines them; the server starts
 * them, and tests run them one at a time with `runJob`.
 */

// Reminders are due to the minute, so the job runs every minute.
defineJob({ name: 'reminders', intervalMs: 60_000, run: runReminders });

// A timer that runs out is completed within seconds, whether or not a client is open.
defineJob({
  name: 'focus-timers',
  intervalMs: 15_000,
  run: ({ now }) => completeExpiredSessions(now),
});

defineJob({
  name: 'notifications-cleanup',
  intervalMs: 6 * 60 * 60_000,
  run: ({ now }) => purgeOldNotifications(now),
});
