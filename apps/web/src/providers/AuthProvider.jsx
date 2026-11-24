import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionEnded, queryKeys } from '../lib/api.js';
import { browserTimeZone, deviceDescriptor } from '../lib/device.js';
import { i18n, setLanguage } from '../lib/i18n.js';
import { useTheme } from './ThemeProvider.jsx';

const AuthContext = createContext(null);

/**
 * Session state of the web client.
 *
 * - `loading`        restoring a session from the refresh cookie
 * - `authenticated`  signed in; `user`, `profile` and `settings` are available
 * - `anonymous`      not signed in
 * - `unreachable`    restoring the session failed for a reason other than "not signed in"
 *                    (no connection, server error, rate limit); `restoreError` says which
 *
 * The signed-in user's data lives in the query cache under `queryKeys.me`, so every screen
 * that edits the profile or settings updates the whole application at once.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { setPreference: setThemePreference } = useTheme();
  const [status, setStatus] = useState('loading');
  const [endedReason, setEndedReason] = useState(null);
  const [restoreError, setRestoreError] = useState(null);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.users.me(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
  const me = meQuery.data ?? null;

  const restore = useCallback(async () => {
    setStatus('loading');
    try {
      await api.auth.refresh();
      queryClient.setQueryData(queryKeys.me, await api.users.me());
      setStatus('authenticated');
    } catch (error) {
      setRestoreError(error?.status === 401 ? null : error);
      setStatus(error?.status === 401 ? 'anonymous' : 'unreachable');
    }
  }, [queryClient]);

  useEffect(() => {
    restore();
  }, [restore]);

  // The account's language and theme win over whatever this browser used before sign-in.
  const language = me?.settings.language;
  const theme = me?.settings.theme;
  useEffect(() => {
    if (language) setLanguage(language);
  }, [language]);
  useEffect(() => {
    if (theme) setThemePreference(theme);
  }, [theme, setThemePreference]);

  useEffect(
    () =>
      onSessionEnded((code) => {
        queryClient.clear();
        setEndedReason(code);
        setStatus('anonymous');
      }),
    [queryClient],
  );

  const enter = useCallback(
    (result) => {
      queryClient.setQueryData(queryKeys.me, {
        user: result.user,
        profile: result.profile,
        settings: result.settings,
      });
      setEndedReason(null);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const login = useCallback(
    async ({ email, password }) => {
      enter(await api.auth.login({ email, password, device: deviceDescriptor() }));
    },
    [enter],
  );

  const register = useCallback(
    async ({ email, password, displayName }) => {
      enter(
        await api.auth.register({
          email,
          password,
          displayName,
          language: i18n.language,
          timeZone: browserTimeZone(),
          device: deviceDescriptor(),
        }),
      );
    },
    [enter],
  );

  const leave = useCallback(() => {
    queryClient.clear();
    setStatus('anonymous');
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      // Whatever the server said, this browser no longer holds a usable session.
      leave();
    }
  }, [leave]);

  const value = useMemo(
    () => ({
      status,
      endedReason,
      restoreError,
      user: me?.user ?? null,
      profile: me?.profile ?? null,
      settings: me?.settings ?? null,
      login,
      register,
      logout,
      leave,
      retry: restore,
      refetchMe: meQuery.refetch,
    }),
    [
      status,
      endedReason,
      restoreError,
      me,
      login,
      register,
      logout,
      leave,
      restore,
      meQuery.refetch,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
