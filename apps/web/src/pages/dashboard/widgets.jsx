import {
  CalendarDays,
  CalendarPlus,
  CircleCheckBig,
  Flame,
  Info,
  ListPlus,
  Repeat,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BarChartArea } from '../../charts/BarSeries.jsx';
import { cn } from '../../lib/cn.js';
import { weekdayOf } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { Button } from '../../ui/Button.jsx';
import { EmptyState } from '../../ui/feedback.jsx';
import { Tooltip } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { GoalProgressBar, describeDeadline } from '../goals/GoalProgress.jsx';
import { CompletionControl } from '../habits/CompletionControl.jsx';
import { describeProgress, describeStreak } from '../habits/habitText.js';
import { TaskRow, dueLabel } from '../tasks/TaskRow.jsx';

/** A small empty state sized for a widget. */
function Nothing({ icon, text, action }) {
  return <EmptyState icon={icon} title={text} action={action} className="px-2 py-6" />;
}

const percentOf = (rate) => Math.round((rate ?? 0) * 100);

/** Today at a glance: habits done out of due, tasks done out of planned. */
export function ProgressWidget({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { summary } = data.habits;
  const tasks = data.tasks.summary;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const rate = summary.rate ?? 0;

  return (
    <div className="flex items-center gap-6">
      <div
        role="img"
        aria-label={t('dashboard:progress.ringLabel', {
          completed: summary.completed,
          due: summary.due,
        })}
        className="relative size-28 shrink-0"
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            className="stroke-surface-2"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - rate)}
            className="stroke-success transition-[stroke-dashoffset] duration-700 ease-standard"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-title font-semibold text-ink tabular-nums">
          {summary.due === 0
            ? t('dashboard:progress.none')
            : t('dashboard:percent', { value: format.number(percentOf(rate)) })}
        </span>
      </div>
      <dl className="flex min-w-0 flex-col gap-3">
        <div>
          <dt className="text-caption text-ink-2">{t('dashboard:progress.habits')}</dt>
          <dd className="text-heading font-semibold text-ink tabular-nums">
            {t('dashboard:progress.fraction', { done: summary.completed, total: summary.due })}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-2">{t('dashboard:progress.tasks')}</dt>
          <dd className="text-heading font-semibold text-ink tabular-nums">
            {t('dashboard:progress.fraction', { done: tasks.done, total: tasks.total })}
            {tasks.overdue > 0 && (
              <span className="ml-2 text-caption font-medium text-danger">
                {t('dashboard:progress.overdue', { count: tasks.overdue })}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function QuickActionsWidget({ onAction }) {
  const { t } = useTranslation();
  const actions = [
    { id: 'task', icon: ListPlus },
    { id: 'habit', icon: Repeat },
    { id: 'event', icon: CalendarPlus },
    { id: 'goal', icon: Target },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map(({ id, icon }) => (
        <Button key={id} icon={icon} onClick={() => onAction(id)} className="justify-start">
          {t(`dashboard:quickActions.${id}`)}
        </Button>
      ))}
    </div>
  );
}

export function HabitsWidget({ data, onSetEntry }) {
  const { t } = useTranslation();
  const format = useFormat();
  const items = data.habits.items.filter((item) => item.due).slice(0, 6);
  if (items.length === 0) return <Nothing icon={Repeat} text={t('dashboard:habits.empty')} />;
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const excused = item.state === 'skipped' || item.state === 'postponed';
        return (
          <li
            key={item.habitId}
            className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <ItemBadge icon={item.habit.icon} color={item.habit.color} size="sm" />
            <div className="min-w-0 flex-1">
              <Link
                to={`/habits/${item.habitId}`}
                className={cn(
                  'block truncate text-body font-medium text-ink hover:underline',
                  item.state === 'completed' && 'text-ink-2 line-through',
                )}
              >
                {item.habit.name}
              </Link>
              <p className="text-caption text-ink-2">
                {excused
                  ? t(`habits:states.${item.state}`)
                  : describeProgress(t, format, item.habit.target, item.value) ||
                    (item.streak.current > 0 ? describeStreak(t, item.streak) : '')}
              </p>
            </div>
            {!excused && (
              <CompletionControl item={item} onChange={(input) => onSetEntry({ item, input })} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function TasksWidget({ data, taskActions, onEditTask }) {
  const { t } = useTranslation();
  const { overdue, due } = data.tasks;
  const rows = [...overdue, ...due].slice(0, 6);
  if (rows.length === 0) {
    return <Nothing icon={CircleCheckBig} text={t('dashboard:tasks.empty')} />;
  }
  return (
    <ul className="-mx-4 -my-3">
      {rows.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={data.today}
          actions={taskActions}
          onEdit={onEditTask}
        />
      ))}
    </ul>
  );
}

export function EventsWidget({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (data.upcoming.length === 0) {
    return <Nothing icon={CalendarDays} text={t('dashboard:events.empty')} />;
  }
  return (
    <ul className="flex flex-col">
      {data.upcoming.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
        >
          <span
            aria-hidden="true"
            className="h-9 w-1 shrink-0 rounded-full"
            style={{
              backgroundColor: item.color ?? (item.kind === 'task' ? '#5e5ce6' : '#0a84ff'),
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">{item.title}</p>
            <p className="text-caption text-ink-2">
              {dueLabel(t, format, item.date, data.today)}
              {item.allDay
                ? ` · ${t('calendar:allDay')}`
                : ` · ${format.wallTime(item.startTime)} – ${format.wallTime(item.endTime)}`}
              {item.kind === 'task' && ` · ${t('calendar:kinds.task')}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GoalsWidget({ data }) {
  const { t } = useTranslation();
  if (data.goals.length === 0) return <Nothing icon={Target} text={t('dashboard:goals.empty')} />;
  return (
    <ul className="flex flex-col gap-4">
      {data.goals.slice(0, 4).map((goal) => {
        const deadline = describeDeadline(t, goal);
        return (
          <li key={goal.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <Link
                to={`/goals/${goal.id}`}
                className="min-w-0 truncate text-body font-medium text-ink hover:underline"
              >
                {goal.title}
              </Link>
              {deadline && (
                <span
                  className={cn(
                    'shrink-0 text-caption text-ink-2',
                    deadline.overdue && 'font-medium text-danger',
                  )}
                >
                  {deadline.text}
                </span>
              )}
            </div>
            <GoalProgressBar goal={goal} />
          </li>
        );
      })}
    </ul>
  );
}

/** Habit completion of the last seven days as bars, with the same figures as a table. */
export function WeekWidget({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { days, habits, tasksCompleted } = data.week;
  const rows = days.map((day) => ({
    ...day,
    label: format.weekdayName(weekdayOf(day.date), 'short'),
    percent: day.due === 0 ? 0 : Math.round((day.completed / day.due) * 100),
  }));
  const change =
    habits.rate !== null && habits.previousRate !== null
      ? percentOf(habits.rate) - percentOf(habits.previousRate)
      : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p>
          <span className="text-title font-semibold text-ink tabular-nums">
            {habits.rate === null
              ? t('dashboard:progress.none')
              : t('dashboard:percent', { value: format.number(percentOf(habits.rate)) })}
          </span>
          <span className="ml-2 text-caption text-ink-2">{t('dashboard:week.habitRate')}</span>
        </p>
        {change !== null && change !== 0 && (
          <p
            className={cn(
              'inline-flex items-center gap-1 text-caption font-medium',
              change > 0 ? 'text-success' : 'text-ink-2',
            )}
          >
            {change > 0 ? (
              <TrendingUp className="size-4" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-4" aria-hidden="true" />
            )}
            {t(change > 0 ? 'dashboard:week.up' : 'dashboard:week.down', {
              value: format.number(Math.abs(change)),
            })}
          </p>
        )}
        <p className="text-caption text-ink-2">
          {t('dashboard:week.tasks', { count: tasksCompleted })}
        </p>
      </div>

      <BarChartArea
        rows={rows.map((row) => ({
          label: row.label,
          title: format.calendarWeekdayDate(row.date),
          value: row.percent,
          display: t('dashboard:progress.fraction', { done: row.completed, total: row.due }),
        }))}
        scale="percent"
        color="var(--pfy-success)"
        height="h-40"
      />
      <div className="sr-only">
        <table>
          <caption>{t('dashboard:week.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('dashboard:week.day')}</th>
              <th scope="col">{t('dashboard:week.habitsColumn')}</th>
              <th scope="col">{t('dashboard:week.tasksColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{format.calendarWeekdayDate(day.date)}</th>
                <td>{t('dashboard:progress.fraction', { done: day.completed, total: day.due })}</td>
                <td>{day.tasksCompleted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-ink-3">{t('dashboard:week.explanation')}</p>
    </div>
  );
}

export function StreaksWidget({ data }) {
  const { t } = useTranslation();
  if (data.streaks.length === 0)
    return <Nothing icon={Flame} text={t('dashboard:streaks.empty')} />;
  return (
    <ul className="flex flex-col">
      {data.streaks.map((streak) => (
        <li
          key={streak.habitId}
          className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
        >
          <ItemBadge icon={streak.icon} color={streak.color} size="sm" />
          <Link
            to={`/habits/${streak.habitId}`}
            className="min-w-0 flex-1 truncate text-body font-medium text-ink hover:underline"
          >
            {streak.name}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 text-body font-semibold text-warning tabular-nums">
            <Flame className="size-4" aria-hidden="true" />
            {describeStreak(t, streak)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const INSIGHT_ICONS = { positive: Sparkles, neutral: Info, attention: TriangleAlert };
const INSIGHT_COLORS = {
  positive: 'bg-success-soft text-success',
  neutral: 'bg-accent-soft text-accent',
  attention: 'bg-warning-soft text-warning',
};

/** Observations about the user's own data, each with the rule that produced it. */
export function InsightsWidget({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (data.insights.length === 0) {
    return <Nothing icon={Sparkles} text={t('dashboard:insights.empty')} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.insights.map((insight) => {
        const Icon = INSIGHT_ICONS[insight.tone];
        const params = {
          ...insight.params,
          date: insight.params.date ? format.calendarWeekdayDate(insight.params.date) : undefined,
        };
        return (
          <li key={insight.kind} className="flex items-start gap-3">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full',
                INSIGHT_COLORS[insight.tone],
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 pt-1 text-body text-ink">
              {t(`dashboard:insights.${insight.kind}.text`, params)}
            </p>
            <Tooltip align="end" content={t(`dashboard:insights.${insight.kind}.rule`)}>
              <button
                type="button"
                aria-label={t('dashboard:insights.how')}
                className="mt-1 rounded-full p-1 text-ink-3 hover:text-ink"
              >
                <Info className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

const ACTIVITY_LINKS = {
  habit: (id) => `/habits/${id}`,
  habitEntry: (id) => `/habits/${id}`,
  goal: (id) => `/goals/${id}`,
  task: () => '/tasks',
  calendarEvent: () => '/calendar',
};

export function ActivityWidget({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (data.activity.length === 0) {
    return <Nothing icon={Sparkles} text={t('dashboard:activity.empty')} />;
  }
  return (
    <ul className="flex flex-col">
      {data.activity.map((entry) => (
        <li
          key={entry.id}
          className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
        >
          <Link
            to={ACTIVITY_LINKS[entry.entityType]?.(entry.entityId) ?? '/'}
            className="min-w-0 truncate text-body text-ink hover:underline"
          >
            {t(`dashboard:activity.${entry.kind}`, { title: entry.title })}
          </Link>
          <time dateTime={entry.at} className="shrink-0 text-caption text-ink-2">
            {format.relative(entry.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
