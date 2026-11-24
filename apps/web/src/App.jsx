import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useErrorMessage } from './hooks/useAccount.js';
import { AppShell } from './layout/AppShell.jsx';
import { AuthLayout } from './layout/AuthLayout.jsx';
import { BrandMark } from './layout/Brand.jsx';
import { queryClient as defaultQueryClient, queryKeys } from './lib/api.js';
import './lib/i18n.js';
import { GoalDetailPage } from './pages/goals/GoalDetailPage.jsx';
import { GoalsPage } from './pages/goals/GoalsPage.jsx';
import { HabitDetailPage } from './pages/habits/HabitDetailPage.jsx';
import { HabitsManagePage } from './pages/habits/HabitsManagePage.jsx';
import { HabitsPage } from './pages/habits/HabitsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { AchievementsPage } from './pages/achievements/AchievementsPage.jsx';
import { FocusPage } from './pages/focus/FocusPage.jsx';
import { JournalEditorPage } from './pages/journal/JournalEditorPage.jsx';
import { JournalPage } from './pages/journal/JournalPage.jsx';
import { MoodPage } from './pages/mood/MoodPage.jsx';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage.jsx';
import { CalendarPage } from './pages/calendar/CalendarPage.jsx';
import { DashboardPage } from './pages/dashboard/DashboardPage.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages.jsx';
import { RegisterPage } from './pages/auth/RegisterPage.jsx';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
import { TasksPage } from './pages/tasks/TasksPage.jsx';
import { AuthProvider, useAuth } from './providers/AuthProvider.jsx';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import { ErrorState, Spinner } from './ui/feedback.jsx';
import { ToastProvider } from './ui/toast.jsx';

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
        }
      }),
    [queryClient],
  );
}

/** Application providers. `queryClient` can be replaced in tests. */
export function AppProviders({ children, queryClient = defaultQueryClient }) {
  useDashboardRefresh(queryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
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
