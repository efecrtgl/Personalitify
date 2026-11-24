import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, ListTodo, Repeat, Target, Timer, Trophy, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useErrorMessage } from '../hooks/useAccount.js';
import { api, queryKeys } from '../lib/api.js';
import { cn } from '../lib/cn.js';
import { useFormat } from '../lib/format.js';
import { Button, IconButton } from '../ui/Button.jsx';
import { Skeleton } from '../ui/feedback.jsx';
import { useToast } from '../ui/toast.jsx';

const ICONS = {
  habit_reminder: Repeat,
  task_due: ListTodo,
  tasks_today: ListTodo,
  goal_deadline: Target,
  event_reminder: CalendarDays,
  achievement_unlocked: Trophy,
  focus_completed: Timer,
};

/** Where a notification leads when it is opened. */
function linkOf({ kind, entityId }) {
  switch (kind) {
    case 'habit_reminder':
      return entityId ? `/habits/${entityId}` : '/habits';
    case 'goal_deadline':
      return entityId ? `/goals/${entityId}` : '/goals';
    case 'event_reminder':
      return '/calendar';
    case 'achievement_unlocked':
      return '/achievements';
    case 'focus_completed':
      return '/focus';
    default:
      return '/tasks';
  }
}

/** The sentence of a notification, phrased from its kind and values. */
export function notificationText(t, format, { kind, params }) {
  const base = `notifications:kinds.${kind}`;
  switch (kind) {
    case 'habit_reminder':
    case 'task_due':
      return t(base, { ...params, time: format.wallTime(params.time) });
    case 'tasks_today':
      if (params.due > 0 && params.overdue > 0) return t(`${base}.both`, params);
      return params.due > 0
        ? t(`${base}.due`, { count: params.due })
        : t(`${base}.overdue`, { count: params.overdue });
    case 'goal_deadline':
      return params.days > 0
        ? t(`${base}.ahead`, { title: params.title, count: params.days })
        : t(`${base}.today`, { title: params.title });
    case 'event_reminder': {
      const { minutes, title } = params;
      if (minutes === 0) return t(`${base}.now`, { title });
      if (minutes % 1440 === 0) return t(`${base}.days`, { title, count: minutes / 1440 });
      if (minutes % 60 === 0) return t(`${base}.hours`, { title, count: minutes / 60 });
      return t(`${base}.minutes`, { title, count: minutes });
    }
    case 'achievement_unlocked':
      return t(base, { name: t(`achievements:items.${params.key}.name`) });
    case 'focus_completed':
      return t(`${base}.${params.kind === 'focus' ? 'focus' : 'break'}`, params);
    default:
      return '';
  }
}

/** The bell in the top bar: unread count, the latest notifications, and their actions. */
export function NotificationsMenu() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  const notifications = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => api.notifications.list({ limit: 20 }),
    // New notifications arrive over the live connection; this is the fallback for when
    // that connection is down.
    refetchInterval: 5 * 60_000,
  });
  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.meta.unread ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
  const options = { onSuccess: refresh, onError: (error) => toast.error(errorMessage(error)) };
  const markRead = useMutation({ mutationFn: (id) => api.notifications.markRead(id), ...options });
  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    ...options,
  });
  const remove = useMutation({ mutationFn: (id) => api.notifications.remove(id), ...options });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openNotification = (notification) => {
    if (!notification.read) markRead.mutate(notification.id);
    setOpen(false);
    navigate(linkOf(notification));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={
          unread > 0 ? t('notifications:openUnread', { count: unread }) : t('notifications:open')
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-10 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.65rem] leading-none font-semibold text-on-danger"
          >
            {unread > 9 ? t('notifications:badgeMore') : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          aria-label={t('notifications:title')}
          className="absolute top-full right-0 z-40 mt-2 flex max-h-[min(32rem,calc(100dvh-5rem))] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-card bg-surface shadow-pop ring-1 ring-line max-sm:fixed max-sm:top-16 max-sm:right-4"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-heading font-semibold text-ink">{t('notifications:title')}</h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={unread === 0}
              loading={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
            >
              {t('notifications:markAllRead')}
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {notifications.isPending ? (
              <div className="p-4">
                <Skeleton className="h-16 rounded-control" />
              </div>
            ) : notifications.isError ? (
              <p role="alert" className="p-4 text-body text-ink-2">
                {t('notifications:loadError')}
              </p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-body font-medium text-ink">{t('notifications:empty')}</p>
                <p className="mt-1 text-caption text-ink-2">
                  {t('notifications:emptyDescription')}
                </p>
              </div>
            ) : (
              <ul>
                {items.map((notification) => {
                  const Icon = ICONS[notification.kind] ?? Bell;
                  return (
                    <li
                      key={notification.id}
                      className="flex items-start gap-1 border-b border-line last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                            notification.read
                              ? 'bg-surface-2 text-ink-3'
                              : 'bg-accent-soft text-accent',
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-body',
                              notification.read ? 'text-ink-2' : 'font-medium text-ink',
                            )}
                          >
                            {notificationText(t, format, notification)}
                          </span>
                          <span className="mt-0.5 block text-caption text-ink-3">
                            {!notification.read && (
                              <span className="mr-1.5 font-medium text-accent">
                                {t('notifications:unread')}
                              </span>
                            )}
                            {format.relative(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                      <IconButton
                        icon={X}
                        size="sm"
                        label={t('notifications:delete')}
                        className="mt-2.5 mr-2"
                        onClick={() => remove.mutate(notification.id)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-line px-4 py-2.5">
            <Link
              to="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-caption font-medium text-accent hover:underline"
            >
              {t('notifications:settings')}
            </Link>
          </footer>
        </section>
      )}
    </div>
  );
}
