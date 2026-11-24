import { createRealtime } from '@personalitify/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notificationText } from '../layout/NotificationsMenu.jsx';
import { api, queryKeys } from '../lib/api.js';
import { useFormat } from '../lib/format.js';
import { useToast } from '../ui/toast.jsx';
import { useAuth } from './AuthProvider.jsx';

const RealtimeContext = createContext('offline');

/**
 * Which cached data an event of each entity type makes stale. An event does not carry
 * enough to patch every view (a finished task changes the dashboard, the analytics and the
 * XP), so the affected queries are refetched; the ones on screen update at once.
 */
const AFFECTED = {
  profile: [queryKeys.me],
  settings: [queryKeys.me, queryKeys.focus.all],
  category: [queryKeys.categories],
  habit: [
    queryKeys.habits.all,
    queryKeys.calendar.all,
    queryKeys.dashboard,
    queryKeys.analytics.all,
  ],
  habitEntry: [
    queryKeys.habits.all,
    queryKeys.calendar.all,
    queryKeys.dashboard,
    queryKeys.analytics.all,
    queryKeys.achievements,
  ],
  goal: [queryKeys.goals.all, queryKeys.dashboard, queryKeys.analytics.all, queryKeys.achievements],
  task: [
    queryKeys.tasks.all,
    queryKeys.goals.all,
    queryKeys.calendar.all,
    queryKeys.dashboard,
    queryKeys.analytics.all,
    queryKeys.achievements,
  ],
  calendarEvent: [queryKeys.calendar.all, queryKeys.dashboard],
  focusSession: [queryKeys.focus.all, queryKeys.achievements],
  // Lists and tags only: an entry that is open in the editor is not replaced under the
  // writer’s hands. A change from elsewhere is merged, or reported, when they save.
  journalEntry: [['journal', 'list'], queryKeys.journal.tags, queryKeys.achievements],
  moodEntry: [queryKeys.mood.all, queryKeys.achievements],
  achievement: [queryKeys.achievements],
  notification: [queryKeys.notifications],
};

/**
 * Keeps the application in step with the account while it is open: every change made on
 * any device arrives as an event and refreshes what it affects. `connect` creates the
 * connection and is replaceable in tests; `null` switches realtime off.
 */
export function RealtimeProvider({ children, connect = createRealtime }) {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const [connection, setConnection] = useState('offline');
  // The handlers read the latest translation and formatters without reconnecting for them.
  const latest = useRef({});
  latest.current = { t, format, toast };

  const signedIn = status === 'authenticated';
  useEffect(() => {
    if (!signedIn || !connect) return undefined;
    const realtime = connect({
      getToken: () => api.http.getFreshAccessToken(),
      onStatus: setConnection,
      // Away for too long to replay: everything is reloaded instead.
      onReset: () => queryClient.invalidateQueries(),
      onEvent: (event) => {
        for (const queryKey of AFFECTED[event.entityType] ?? []) {
          queryClient.invalidateQueries({ queryKey });
        }
        if (event.event === 'notification.created' && !event.data.silent) {
          const { t: translate, format: formatters, toast: toasts } = latest.current;
          toasts.info(notificationText(translate, formatters, event.data));
        }
      },
    });
    realtime.connect();
    return () => {
      realtime.disconnect();
      setConnection('offline');
    };
  }, [signedIn, connect, queryClient]);

  return <RealtimeContext.Provider value={connection}>{children}</RealtimeContext.Provider>;
}

/** `connecting`, `connected`, `disconnected`, `unauthorized` or `offline`. */
export const useRealtimeStatus = () => useContext(RealtimeContext);
