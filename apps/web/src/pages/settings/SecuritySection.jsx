import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { rules, useForm } from '../../hooks/useForm.js';
import { api, queryKeys } from '../../lib/api.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Badge, Panel } from '../../ui/display.jsx';
import { Banner, EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { Field, PasswordInput } from '../../ui/fields.jsx';
import { ConfirmDialog } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

function PasswordPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();

  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '' },
    validate: {
      currentPassword: [rules.required],
      newPassword: [rules.required, rules.minLength(8), rules.maxLength(128)],
    },
    onSubmit: async (values) => {
      const { revokedSessions } = await api.auth.changePassword(values);
      form.reset();
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t('settings:security.passwordChanged', { count: revokedSessions }));
    },
  });

  return (
    <Panel
      title={t('settings:security.passwordTitle')}
      description={t('settings:security.passwordDescription')}
    >
      {form.formError && (
        <Banner tone="danger" className="mb-5">
          {form.formError.code === 'INVALID_CREDENTIALS'
            ? t('settings:security.wrongPassword')
            : errorMessage(form.formError)}
        </Banner>
      )}
      <form onSubmit={form.handleSubmit} noValidate className="flex flex-col gap-4 sm:max-w-sm">
        <Field label={t('settings:security.currentPassword')} error={form.errors.currentPassword}>
          {(props) => (
            <PasswordInput
              autoComplete="current-password"
              {...props}
              {...form.bind('currentPassword')}
            />
          )}
        </Field>
        <Field
          label={t('settings:security.newPassword')}
          hint={t('auth:register.passwordHint')}
          error={form.errors.newPassword}
        >
          {(props) => (
            <PasswordInput autoComplete="new-password" {...props} {...form.bind('newPassword')} />
          )}
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={form.submitting}>
            {t('settings:security.changePassword')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SessionsPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { leave } = useAuth();
  const [confirmAll, setConfirmAll] = useState(false);

  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.auth.listSessions(),
  });

  const revoke = useMutation({
    mutationFn: (sessionId) => api.auth.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
      toast.success(t('settings:security.sessionRevoked'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.auth.logoutAll(),
    onSuccess: leave,
    onError: (error) => {
      setConfirmAll(false);
      toast.error(errorMessage(error));
    },
  });

  return (
    <Panel
      title={t('settings:security.sessionsTitle')}
      description={t('settings:security.sessionsDescription')}
      actions={
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirmAll(true)}>
          {t('settings:security.signOutEverywhere')}
        </Button>
      }
    >
      {sessions.isPending ? (
        <SkeletonList rows={2} />
      ) : sessions.isError ? (
        <ErrorState description={errorMessage(sessions.error)} onRetry={sessions.refetch} />
      ) : (
        <ul className="flex flex-col">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
                  {session.device?.name ?? t('settings:security.unknownDevice')}
                  {session.current && (
                    <Badge tone="success">{t('settings:security.thisSession')}</Badge>
                  )}
                </p>
                <p className="mt-0.5 text-caption text-ink-2">
                  {t('settings:security.lastActive', {
                    when: format.relative(session.lastUsedAt),
                  })}
                  {session.ip && ` · ${session.ip}`}
                </p>
              </div>
              {!session.current && (
                <Button
                  size="sm"
                  onClick={() => revoke.mutate(session.id)}
                  loading={revoke.isPending && revoke.variables === session.id}
                >
                  {t('settings:security.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => revokeAll.mutate()}
        loading={revokeAll.isPending}
        title={t('settings:security.signOutEverywhereTitle')}
        description={t('settings:security.signOutEverywhereDescription')}
        confirmLabel={t('settings:security.signOutEverywhere')}
      />
    </Panel>
  );
}

function ActivityPanel() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const [page, setPage] = useState(1);

  const log = useQuery({
    queryKey: queryKeys.securityLog(page),
    queryFn: () => api.account.securityLog({ page, limit: 8 }),
    placeholderData: (previous) => previous,
  });

  return (
    <Panel
      title={t('settings:security.activityTitle')}
      description={t('settings:security.activityDescription')}
    >
      {log.isPending ? (
        <SkeletonList rows={3} />
      ) : log.isError ? (
        <ErrorState description={errorMessage(log.error)} onRetry={log.refetch} />
      ) : log.data.items.length === 0 ? (
        <EmptyState title={t('settings:security.activityEmpty')} className="py-6" />
      ) : (
        <>
          <ul className="flex flex-col">
            {log.data.items.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-line py-3 first:border-t-0 first:pt-0"
              >
                <span className="text-body text-ink">
                  {t(`settings:security.actions.${entry.action.replaceAll('.', '_')}`, {
                    defaultValue: entry.action,
                  })}
                </span>
                <time dateTime={entry.createdAt} className="text-caption text-ink-2">
                  {format.dateTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {log.data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                {t('common:previous')}
              </Button>
              <span className="text-caption text-ink-2">
                {t('common:pageOf', { page, total: log.data.meta.totalPages })}
              </span>
              <Button
                size="sm"
                disabled={page >= log.data.meta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t('common:next')}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export function SecuritySection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <>
      <Panel title={t('settings:security.emailTitle')}>
        <p className="flex flex-wrap items-center gap-2 text-body text-ink">
          {user.email}
          <Badge tone={user.emailVerified ? 'success' : 'warning'}>
            {t(user.emailVerified ? 'settings:security.verified' : 'settings:security.unverified')}
          </Badge>
        </p>
      </Panel>
      <PasswordPanel />
      <SessionsPanel />
      <ActivityPanel />
    </>
  );
}
