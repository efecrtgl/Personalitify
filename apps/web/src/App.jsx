import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useErrorMessage } from './hooks/useAccount.js';
import { AppShell } from './layout/AppShell.jsx';
import { AuthLayout } from './layout/AuthLayout.jsx';
import { BrandMark } from './layout/Brand.jsx';
import { RequiredUpdateGate } from './layout/PlatformNotices.jsx';
import { queryClient as defaultQueryClient, queryKeys } from './lib/api.js';
import './lib/i18n.js';
import { AuthProvider, useAuth } from './providers/AuthProvider.jsx';
import { RealtimeProvider } from './providers/RealtimeProvider.jsx';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import { ErrorState, Spinner } from './ui/feedback.jsx';
import { ToastProvider } from './ui/toast.jsx';

// Pages are split out of the first download: each is fetched when its route is opened.
const AchievementsPage = lazy(() =>
  import('./pages/achievements/AchievementsPage.jsx').then((module) => ({
    default: module.AchievementsPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/analytics/AnalyticsPage.jsx').then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const CalendarPage = lazy(() =>
  import('./pages/calendar/CalendarPage.jsx').then((module) => ({ default: module.CalendarPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard/DashboardPage.jsx').then((module) => ({
    default: module.DashboardPage,
  })),
);
const FocusPage = lazy(() =>
  import('./pages/focus/FocusPage.jsx').then((module) => ({ default: module.FocusPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/auth/PasswordPages.jsx').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const GoalDetailPage = lazy(() =>
  import('./pages/goals/GoalDetailPage.jsx').then((module) => ({ default: module.GoalDetailPage })),
);
const GoalsPage = lazy(() =>
  import('./pages/goals/GoalsPage.jsx').then((module) => ({ default: module.GoalsPage })),
);
const HabitDetailPage = lazy(() =>
  import('./pages/habits/HabitDetailPage.jsx').then((module) => ({
    default: module.HabitDetailPage,
  })),
);
const HabitsManagePage = lazy(() =>
  import('./pages/habits/HabitsManagePage.jsx').then((module) => ({
    default: module.HabitsManagePage,
  })),
);
const HabitsPage = lazy(() =>
  import('./pages/habits/HabitsPage.jsx').then((module) => ({ default: module.HabitsPage })),
);
const JournalEditorPage = lazy(() =>
  import('./pages/journal/JournalEditorPage.jsx').then((module) => ({
    default: module.JournalEditorPage,
  })),
);
const JournalPage = lazy(() =>
  import('./pages/journal/JournalPage.jsx').then((module) => ({ default: module.JournalPage })),
);
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage.jsx').then((module) => ({ default: module.LoginPage })),
);
const MoodPage = lazy(() =>
  import('./pages/mood/MoodPage.jsx').then((module) => ({ default: module.MoodPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage.jsx').then((module) => ({ default: module.NotFoundPage })),
);
const RegisterPage = lazy(() =>
  import('./pages/auth/RegisterPage.jsx').then((module) => ({ default: module.RegisterPage })),
);
const ResetPasswordPage = lazy(() =>
  import('./pages/auth/PasswordPages.jsx').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage.jsx').then((module) => ({ default: module.SettingsPage })),
);
const TasksPage = lazy(() =>
  import('./pages/tasks/TasksPage.jsx').then((module) => ({ default: module.TasksPage })),
);
const VerifyEmailPage = lazy(() =>
  import('./pages/auth/VerifyEmailPage.jsx').then((module) => ({
    default: module.VerifyEmailPage,
  })),
);

/** Full-screen state while the session is being restored. */
function BootScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <BrandMark className="size-12" />
      <Spinner />
    </div>
  );
}

function Unreachable() {
  const { t } = useTranslation();
  const { retry, restoreError } = useAuth();
  const errorMessage = useErrorMessage();
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <ErrorState
        title={t('common:errors.unreachableTitle')}
        description={errorMessage(restoreError)}
        onRetry={retry}
      />
    </div>
  );
}

/** Routes that need a signed-in user. Remembers where the visitor wanted to go. */
function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <BootScreen />;
  if (status === 'unreachable') return <Unreachable />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Routes for visitors only; signed-in users are sent to the application. */
function RequireAnonymous() {
  const { status } = useAuth();
  if (status === 'loading') return <BootScreen />;
  if (status === 'unreachable') return <Unreachable />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function AppRoutes() {
  return (
    <RequiredUpdateGate>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="habits" element={<HabitsPage />} />
            <Route path="habits/all" element={<HabitsManagePage />} />
            <Route path="habits/:habitId" element={<HabitDetailPage />} />
            <Route path="tasks" element={<TasksPage view="today" />} />
            <Route path="tasks/upcoming" element={<TasksPage view="upcoming" />} />
            <Route path="tasks/all" element={<TasksPage view="all" />} />
            <Route path="tasks/done" element={<TasksPage view="done" />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="goals/:goalId" element={<GoalDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/:section" element={<SettingsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="focus" element={<FocusPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="journal/:entryId" element={<JournalEditorPage />} />
            <Route path="mood" element={<MoodPage />} />
            <Route path="achievements" element={<AchievementsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route element={<AuthLayout />}>
          <Route element={<RequireAnonymous />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
          </Route>
          {/* Reachable in any state: the link may be opened on a signed-in or signed-out device. */}
          <Route path="verify-email" element={<VerifyEmailPage />} />
        </Route>
      </Routes>
    </RequiredUpdateGate>
  );
}

/**
 * The dashboard summarizes every module, so any successful change anywhere makes it stale.
 * Watching the mutation cache keeps that knowledge in one place instead of in every module.
 */
function useDashboardRefresh(queryClient) {
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.mutation.state.status === 'success') {
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
          queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.focus.state });
          queryClient.invalidateQueries({ queryKey: queryKeys.achievements });
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        }
      }),
    [queryClient],
  );
}

/**
 * Application providers. `queryClient` can be replaced in tests; `realtime` is the function
 * that opens the live connection (omit for the real one, pass `null` for none).
 */
export function AppProviders({ children, queryClient = defaultQueryClient, realtime }) {
  useDashboardRefresh(queryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RealtimeProvider {...(realtime === undefined ? {} : { connect: realtime })}>
                {children}
              </RealtimeProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  );
}
