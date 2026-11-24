import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { addDays, startOfWeek } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button } from '../../ui/Button.jsx';
import { Badge, Card, Panel } from '../../ui/display.jsx';
import { ErrorState, Skeleton, SkeletonList } from '../../ui/feedback.jsx';
import { ConfirmDialog } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { HabitFormModal } from './HabitFormModal.jsx';
import { describeSchedule, describeStreak, describeTarget } from './habitText.js';
import { useHabitActions } from './useHabits.js';

const HISTORY_WEEKS = 16;

/** A single figure with the sentence that says how it is calculated. */
function Stat({ label, value, explanation }) {
  return (
    <Card className="flex flex-col p-4">
      <p className="text-caption font-medium text-ink-2">{label}</p>
      <p className="mt-1 text-title font-semibold text-ink tabular-nums">{value}</p>
      {explanation && <p className="mt-2 text-caption text-ink-3">{explanation}</p>}
    </Card>
  );
}

const CELL_STYLES = {
  partial: 'opacity-45',
  pending: 'bg-surface-3',
  missed: 'bg-danger-soft ring-1 ring-inset ring-danger/40',
  skipped: 'bg-surface-3',
  postponed: 'bg-surface-3',
  not_due: 'bg-surface-2',
};

/** The last weeks as a grid: one column per week, one cell per day, colored by its state. */
function HistoryGrid({ history, color, weekStart }) {
  const { t } = useTranslation();
  const format = useFormat();
  const weeks = [];
  for (let index = 0; index < history.days.length; index += 7) {
    weeks.push(history.days.slice(index, index + 7));
  }
  const weekdays = Array.from({ length: 7 }, (_, index) => ((weekStart - 1 + index) % 7) + 1);
  const completed = history.days.filter((day) => day.state === 'completed').length;
  const missed = history.days.filter((day) => day.state === 'missed').length;

  return (
    <div>
      <div
        role="img"
        aria-label={t('habits:detail.historySummary', { weeks: weeks.length, completed, missed })}
        className="flex gap-1 overflow-x-auto pb-1"
      >
        <div className="flex flex-col gap-1 pr-1 text-caption text-ink-3" aria-hidden="true">
          {weekdays.map((weekday) => (
            <span key={weekday} className="flex h-4 items-center leading-none">
              {format.weekdayName(weekday, 'narrow')}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="flex flex-col gap-1">
            {week.map((day) => (
              <span
                key={day.date}
                title={`${format.calendarShortDate(day.date)} · ${t(`habits:states.${day.state}`)}`}
                style={
                  day.state === 'completed' || day.state === 'partial'
                    ? { backgroundColor: color }
                    : undefined
                }
                className={cn(
                  'size-4 rounded-[4px]',
                  CELL_STYLES[day.state],
                  day.date > history.today && 'invisible',
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />
          {t('habits:states.completed')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', CELL_STYLES.missed)} />
          {t('habits:states.missed')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-surface-3" />
          {t('habits:detail.legendExcused')}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-surface-2 ring-1 ring-line ring-inset" />
          {t('habits:states.not_due')}
        </li>
      </ul>
    </div>
  );
}

/** Completions per weekday as horizontal bars, with the numbers written out. */
function WeekdayBars({ byWeekday, color, weekStart }) {
  const format = useFormat();
  const ordered = Array.from({ length: 7 }, (_, index) => byWeekday[(weekStart - 1 + index) % 7]);
  const max = Math.max(1, ...ordered.map((day) => Math.max(day.due, day.completed)));
  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((day) => (
        <li key={day.weekday} className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-caption text-ink-2">
            {format.weekdayName(day.weekday, 'short')}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(day.completed / max) * 100}%`, backgroundColor: color }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-caption text-ink-2 tabular-nums">
            {day.due > 0 ? `${day.completed}/${day.due}` : format.number(day.completed)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HabitDetailPage() {
  const { t } = useTranslation();
  const { habitId } = useParams();
  const navigate = useNavigate();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const { settings } = useAuth();
  const actions = useHabitActions();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const habitQuery = useQuery({
    queryKey: queryKeys.habits.detail(habitId),
    queryFn: () => api.habits.get(habitId),
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.habits.stats(habitId),
    queryFn: () => api.habits.stats(habitId),
  });
  const today = statsQuery.data?.today;
  const from = today && startOfWeek(addDays(today, -7 * (HISTORY_WEEKS - 1)), settings.weekStart);
  const to = today && addDays(startOfWeek(today, settings.weekStart), 6);
  const historyQuery = useQuery({
    queryKey: queryKeys.habits.history(habitId, from, to),
    queryFn: () => api.habits.history(habitId, { from, to }),
    enabled: Boolean(today),
  });

  const back = (
    <Link
      to="/habits"
      className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('habits:detail.back')}
    </Link>
  );

  if (habitQuery.isPending) {
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-16 max-w-md" />
        <SkeletonList rows={3} />
      </>
    );
  }
  if (habitQuery.isError) {
    return (
      <>
        {back}
        <ErrorState
          title={habitQuery.error.status === 404 ? t('habits:detail.notFound') : undefined}
          description={errorMessage(habitQuery.error)}
          onRetry={habitQuery.error.status === 404 ? undefined : habitQuery.refetch}
        />
      </>
    );
  }

  const habit = habitQuery.data;
  const stats = statsQuery.data;
  const month = stats?.windows.find((window) => window.days === 30);
  const target = describeTarget(t, format, habit.target);
  const notes = (historyQuery.data?.days ?? []).filter((day) => day.note).reverse();
  const unit = stats ? t(`habits:units.${stats.unit}`) : '';

  return (
    <>
      {back}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <ItemBadge icon={habit.icon} color={habit.color} size="lg" />
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-ink sm:text-display">{habit.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-2">
              <span>{describeSchedule(t, format, habit.schedule)}</span>
              {target && <span>{target}</span>}
              {habit.archived && <Badge>{t('habits:manage.archived')}</Badge>}
            </p>
            {habit.description && (
              <p className="mt-2 max-w-prose text-body text-ink-2">{habit.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            {t('habits:actions.edit')}
          </Button>
          <Button
            icon={habit.archived ? ArchiveRestore : Archive}
            loading={actions.archive.isPending || actions.unarchive.isPending}
            onClick={() => (habit.archived ? actions.unarchive : actions.archive).mutate(habit.id)}
          >
            {t(habit.archived ? 'habits:actions.unarchive' : 'habits:actions.archive')}
          </Button>
          <Button variant="danger-ghost" icon={Trash2} onClick={() => setRemoving(true)}>
            {t('habits:actions.delete')}
          </Button>
        </div>
      </header>

      {statsQuery.isPending ? (
        <SkeletonList rows={2} />
      ) : statsQuery.isError ? (
        <ErrorState description={errorMessage(statsQuery.error)} onRetry={statsQuery.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t('habits:detail.currentStreak')}
              value={describeStreak(t, stats.streak, 'current')}
              explanation={t(`habits:detail.streakExplanation_${stats.unit}`)}
            />
            <Stat
              label={t('habits:detail.bestStreak')}
              value={describeStreak(t, stats.streak, 'best')}
              explanation={
                stats.streakGoal
                  ? t('habits:detail.streakGoal', { count: stats.streakGoal })
                  : undefined
              }
            />
            <Stat
              label={t('habits:detail.rate30')}
              value={
                month.rate === null
                  ? t('habits:detail.noData')
                  : t('habits:day.percent', { value: format.number(Math.round(month.rate * 100)) })
              }
              explanation={t('habits:detail.rateExplanation', {
                completed: month.completed,
                due: month.due,
                unit,
              })}
            />
            <Stat
              label={t('habits:detail.total')}
              value={format.number(stats.totalCompletions)}
              explanation={t('habits:detail.totalExplanation')}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
            <Panel
              title={t('habits:detail.historyTitle')}
              description={t('habits:detail.historyDescription', { weeks: HISTORY_WEEKS })}
            >
              {historyQuery.isPending ? (
                <Skeleton className="h-32" />
              ) : historyQuery.isError ? (
                <ErrorState
                  description={errorMessage(historyQuery.error)}
                  onRetry={historyQuery.refetch}
                />
              ) : (
                <HistoryGrid
                  history={historyQuery.data}
                  color={habit.color}
                  weekStart={settings.weekStart}
                />
              )}
            </Panel>
            <Panel
              title={t('habits:detail.weekdaysTitle')}
              description={t(
                habit.schedule.mode === 'flexible'
                  ? 'habits:detail.weekdaysDescriptionFlexible'
                  : 'habits:detail.weekdaysDescription',
              )}
            >
              <WeekdayBars
                byWeekday={stats.byWeekday}
                color={habit.color}
                weekStart={settings.weekStart}
              />
            </Panel>
          </div>

          {notes.length > 0 && (
            <Panel title={t('habits:detail.notesTitle')} className="mt-6">
              <ul className="flex flex-col">
                {notes.map((day) => (
                  <li
                    key={day.date}
                    className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <p className="text-caption text-ink-2">
                      {format.calendarDate(day.date)} · {t(`habits:states.${day.state}`)}
                    </p>
                    <p className="mt-0.5 text-body whitespace-pre-wrap text-ink">{day.note}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {editing && <HabitFormModal habit={habit} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={() =>
          actions.remove.mutate(habit.id, {
            onSuccess: () => navigate('/habits', { replace: true }),
          })
        }
        loading={actions.remove.isPending}
        title={t('habits:delete.title', { name: habit.name })}
        description={t('habits:delete.description')}
        confirmLabel={t('habits:actions.delete')}
      />
    </>
  );
}
