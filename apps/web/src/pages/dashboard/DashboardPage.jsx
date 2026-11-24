import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage, useUpdateSettings } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Card } from '../../ui/display.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { useToast } from '../../ui/toast.jsx';
import { EventFormModal } from '../calendar/EventFormModal.jsx';
import { useCalendarActions } from '../calendar/CalendarPage.jsx';
import { GoalFormModal } from '../goals/GoalFormModal.jsx';
import { HabitFormModal } from '../habits/HabitFormModal.jsx';
import { TaskFormModal } from '../tasks/TaskFormModal.jsx';
import { useTaskActions } from '../tasks/useTasks.js';
import { CustomizeDialog } from './CustomizeDialog.jsx';
import {
  ActivityWidget,
  EventsWidget,
  GoalsWidget,
  HabitsWidget,
  InsightsWidget,
  ProgressWidget,
  QuickActionsWidget,
  StreaksWidget,
  TasksWidget,
  WeekWidget,
} from './widgets.jsx';

/** Which greeting fits the hour in the user's own time zone. */
export function greetingKey(date, timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(date),
  );
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

/** Each widget: its component, where its "see all" link leads, and whether it spans the row. */
const WIDGETS = {
  progress: { component: ProgressWidget },
  quickActions: { component: QuickActionsWidget },
  habits: { component: HabitsWidget, to: '/habits' },
  tasks: { component: TasksWidget, to: '/tasks' },
  events: { component: EventsWidget, to: '/calendar' },
  goals: { component: GoalsWidget, to: '/goals' },
  week: { component: WeekWidget, wide: true },
  streaks: { component: StreaksWidget, to: '/habits/all' },
  insights: { component: InsightsWidget },
  activity: { component: ActivityWidget },
};

function WidgetFrame({ id, to, wide, children }) {
  const { t } = useTranslation();
  return (
    <Card className={cn('flex min-w-0 flex-col p-5', wide && 'lg:col-span-2')}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-heading font-semibold text-ink">{t(`dashboard:widgets.${id}`)}</h2>
        {to && (
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-caption font-medium text-accent hover:underline"
          >
            {t('dashboard:seeAll')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const { profile, settings } = useAuth();
  const updateSettings = useUpdateSettings({ silent: true });
  const taskActions = useTaskActions();
  const calendarActions = useCalendarActions();
  const [customizing, setCustomizing] = useState(false);
  const [dialog, setDialog] = useState(null);

  const dashboard = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.dashboard.get(),
  });

  // Recording a habit updates the one item at once; the rest of the dashboard follows from
  // the refresh that every successful change triggers.
  const setEntry = useMutation({
    mutationFn: ({ item, input }) =>
      input === null
        ? api.habits.clearEntry(item.habitId, item.date)
        : api.habits.setEntry(item.habitId, item.date, input),
    onSuccess: (updated) =>
      queryClient.setQueryData(queryKeys.dashboard, (current) =>
        current
          ? {
              ...current,
              habits: {
                ...current.habits,
                items: current.habits.items.map((item) =>
                  item.habitId === updated.habitId ? updated : item,
                ),
              },
            }
          : current,
      ),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const data = dashboard.data;
  const visible = settings.dashboard.widgets.filter(
    (widget) => widget.visible && WIDGETS[widget.id],
  );
  const period = greetingKey(new Date(), settings.timeZone);

  const widgetProps = {
    data,
    taskActions,
    onSetEntry: (variables) => setEntry.mutate(variables),
    onEditTask: (task) => setDialog({ type: 'task', task }),
    onAction: (type) => setDialog({ type }),
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title font-semibold text-ink sm:text-display">
            {t(`dashboard:greeting.${period}`, { name: profile.displayName })}
          </h1>
          <p className="mt-1 text-body text-ink-2 first-letter:uppercase">
            {data ? format.calendarWeekdayDate(data.today) : t('common:loading')}
          </p>
        </div>
        <Button icon={SlidersHorizontal} onClick={() => setCustomizing(true)}>
          {t('dashboard:customize.open')}
        </Button>
      </header>

      {dashboard.isPending ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48 rounded-card" />
          ))}
        </div>
      ) : dashboard.isError ? (
        <ErrorState description={errorMessage(dashboard.error)} onRetry={dashboard.refetch} />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={SlidersHorizontal}
            title={t('dashboard:allHidden.title')}
            description={t('dashboard:allHidden.description')}
            action={
              <Button variant="primary" onClick={() => setCustomizing(true)}>
                {t('dashboard:customize.open')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {visible.map(({ id }) => {
            const { component: Widget, to, wide } = WIDGETS[id];
            return (
              <WidgetFrame key={id} id={id} to={to} wide={wide}>
                <Widget {...widgetProps} />
              </WidgetFrame>
            );
          })}
        </div>
      )}

      {customizing && (
        <CustomizeDialog
          widgets={settings.dashboard.widgets}
          saving={updateSettings.isPending}
          onClose={() => setCustomizing(false)}
          onSave={(widgets) =>
            updateSettings.mutate(
              { dashboard: { widgets } },
              { onSuccess: () => setCustomizing(false) },
            )
          }
        />
      )}
      {dialog?.type === 'task' && (
        <TaskFormModal
          task={dialog.task ?? null}
          defaults={{ dueDate: data?.today }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'habit' && (
        <HabitFormModal
          habit={null}
          defaultStartDate={data?.today}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'goal' && (
        <GoalFormModal defaults={{ startDate: data?.today }} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'event' && data && (
        <EventFormModal
          event={null}
          defaults={{ date: data.today }}
          actions={calendarActions}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
