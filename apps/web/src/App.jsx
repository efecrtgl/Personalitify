import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useErrorMessage } from './hooks/useAccount.js';
import { AppShell } from './layout/AppShell.jsx';
import { AuthLayout } from './layout/AuthLayout.jsx';
import { BrandMark } from './layout/Brand.jsx';
import { queryClient as defaultQueryClient } from './lib/api.js';
import './lib/i18n.js';
import { HomePage } from './pages/HomePage.jsx';
import { HabitDetailPage } from './pages/habits/HabitDetailPage.jsx';
import { HabitsManagePage } from './pages/habits/HabitsManagePage.jsx';
import { HabitsPage } from './pages/habits/HabitsPage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages.jsx';
import { RegisterPage } from './pages/auth/RegisterPage.jsx';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
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
          <Route index element={<HomePage />} />
          <Route path="habits" element={<HabitsPage />} />
          <Route path="habits/all" element={<HabitsManagePage />} />
          <Route path="habits/:habitId" element={<HabitDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:section" element={<SettingsPage />} />
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

/** Application providers. `router` and `queryClient` can be replaced in tests. */
export function AppProviders({ children, queryClient = defaultQueryClient }) {
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
