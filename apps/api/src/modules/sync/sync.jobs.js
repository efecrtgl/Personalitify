import { defineJob } from '../../core/jobs.js';
import { pruneHistory } from './sync.service.js';

// History older than the retention is removed a few times a day; nothing depends on the
// exact moment.
defineJob({
  name: 'sync-retention',
  intervalMs: 6 * 60 * 60_000,
  run: ({ now }) => pruneHistory(now),
});
