import { Info, Minus, Sparkles, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BarSeries } from '../../charts/BarSeries.jsx';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { Badge, Card, Panel } from '../../ui/display.jsx';
import { Tooltip } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';

export const percentOf = (rate) => Math.round(rate * 100);

/** The text of a completion rate, or a dash when there was nothing to judge. */
function useRateText() {
  const { t } = useTranslation();
  const format = useFormat();
  return (rate) =>
    rate === null
      ? t('analytics:none')
      : t('analytics:percent', { value: format.number(percentOf(rate)) });
}

/** A small "how is this calculated" button with the rule as a tooltip. */
function Explain({ text }) {
  const { t } = useTranslation();
  return (
    <Tooltip align="end" content={text}>
      <button
        type="button"
        aria-label={t('analytics:how')}
        className="rounded-full p-1 text-ink-3 hover:text-ink print:hidden"
      >
        <Info className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** How a rate moved against the previous period, in words and with an icon. */
function RateChange({ rate, previousRate }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (rate === null) return null;
  if (previousRate === null) {
    return <p className="text-caption text-ink-3">{t('analytics:change.noPrevious')}</p>;
  }
  const points = percentOf(rate) - percentOf(previousRate);
  const Icon = points > 0 ? TrendingUp : points < 0 ? TrendingDown : Minus;
  return (
    <p
      className={cn(
        'inline-flex items-center gap-1 text-caption font-medium',
        points > 0 ? 'text-success' : 'text-ink-2',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {points === 0
        ? t('analytics:change.same')
        : t(points > 0 ? 'analytics:change.up' : 'analytics:change.down', {
            value: format.number(Math.abs(points)),
          })}
    </p>
  );
}

function Stat({ label, value, explain, children }) {
  return (
    <Card as="div" className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="pt-1 text-caption font-medium text-ink-2">{label}</h3>
        <Explain text={explain} />
      </div>
      <p className="mt-1 text-display font-semibold text-ink tabular-nums">{value}</p>
      <div className="mt-1 flex flex-col gap-1 text-caption text-ink-2">{children}</div>
    </Card>
  );
}

/** The four headline figures of the period. */
export function KeyFigures({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  const rateText = useRateText();
  const { habits, tasks, goals } = data;
  const judgedTasks = tasks.onTime + tasks.late;

  return (
    <section
      aria-label={t('analytics:title')}
      className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4"
    >
      <Stat
        label={t('analytics:kpi.habitRate.label')}
        value={rateText(habits.rate)}
        explain={t('analytics:kpi.habitRate.explain')}
      >
        <p>
          {habits.due === 0
            ? t('analytics:kpi.habitRate.empty')
            : t('analytics:kpi.habitRate.detail', {
                done: format.number(habits.completed),
                total: format.number(habits.due),
              })}
        </p>
        <RateChange rate={habits.rate} previousRate={habits.previous.rate} />
      </Stat>
      <Stat
        label={t('analytics:kpi.tasks.label')}
        value={format.number(tasks.completed)}
        explain={t('analytics:kpi.tasks.explain')}
      >
        <p>{t('analytics:kpi.tasks.detail', { value: format.number(tasks.previous.completed) })}</p>
      </Stat>
      <Stat
        label={t('analytics:kpi.onTime.label')}
        value={rateText(tasks.onTimeRate)}
        explain={t('analytics:kpi.onTime.explain')}
      >
        <p>
          {judgedTasks === 0
            ? t('analytics:kpi.onTime.empty')
            : t('analytics:kpi.onTime.detail', {
                done: format.number(tasks.onTime),
                total: format.number(judgedTasks),
              })}
        </p>
      </Stat>
      <Stat
        label={t('analytics:kpi.goals.label')}
        value={format.number(goals.milestonesCompleted)}
        explain={t('analytics:kpi.goals.explain')}
      >
        <p>{t('analytics:kpi.goals.detail', { count: goals.completed })}</p>
      </Stat>
    </section>
  );
}

/** Axis label and full name of one step of the series. */
function useStepLabels(data) {
  const { t } = useTranslation();
  const format = useFormat();
  return (step) => {
    if (data.bucket === 'month') {
      return {
        label: format.calendarMonthShort(step.from),
        title: format.calendarMonth(step.from),
      };
    }
    if (data.bucket === 'week') {
      return {
        label: format.calendarShortDate(step.from),
        title: t('analytics:rangeTitle', {
          from: format.calendarShortDate(step.from),
          to: format.calendarShortDate(step.to),
        }),
      };
    }
    return {
      label:
        data.period === 'week'
          ? format.weekdayName(
              ((new Date(`${step.from}T00:00:00Z`).getUTCDay() + 6) % 7) + 1,
              'short',
            )
          : String(Number(step.from.slice(8))),
      title: format.calendarWeekdayDate(step.from),
    };
  };
}

function ChartPanel({ title, explain, className, children }) {
  return (
    <Panel title={title} className={className}>
      {children}
      <p className="mt-3 text-caption text-ink-3">{explain}</p>
    </Panel>
  );
}

/** Habit completion rate over the steps of the period. */
export function HabitRateChart({ data, className }) {
  const { t } = useTranslation();
  const format = useFormat();
  const rateText = useRateText();
  const labels = useStepLabels(data);
  const rows = data.series.map((step) => ({
    key: step.from,
    ...labels(step),
    value: step.habits.rate === null ? null : percentOf(step.habits.rate),
    display:
      step.habits.rate === null
        ? t('analytics:charts.habits.nothingDue')
        : rateText(step.habits.rate),
    detail:
      step.habits.due === 0
        ? ''
        : t('analytics:charts.habits.tooltip', {
            done: format.number(step.habits.completed),
            total: format.number(step.habits.due),
          }),
  }));
  return (
    <ChartPanel
      title={t('analytics:charts.habits.title')}
      explain={t('analytics:charts.habits.explain')}
      className={className}
    >
      <BarSeries
        rows={rows}
        scale="percent"
        color="var(--pfy-success)"
        caption={t('analytics:charts.habits.caption')}
        columns={{
          step: t(`analytics:charts.step.${data.bucket}`),
          value: t('analytics:charts.habits.rate'),
          detail: t('analytics:charts.habits.column'),
        }}
      />
    </ChartPanel>
  );
}

/** Finished tasks over the steps of the period. */
export function TasksChart({ data, className }) {
  const { t } = useTranslation();
  const labels = useStepLabels(data);
  const rows = data.series.map((step) => ({
    key: step.from,
    ...labels(step),
    value: step.tasks.completed,
    display: t('analytics:charts.tasks.tooltip', { count: step.tasks.completed }),
  }));
  return (
    <ChartPanel
      title={t('analytics:charts.tasks.title')}
      explain={t('analytics:charts.tasks.explain')}
      className={className}
    >
      <BarSeries
        rows={rows}
        scale="count"
        color="var(--pfy-accent)"
        caption={t('analytics:charts.tasks.caption')}
        columns={{
          step: t(`analytics:charts.step.${data.bucket}`),
          value: t('analytics:charts.tasks.column'),
        }}
      />
    </ChartPanel>
  );
}

/** Habit completion rate by weekday, starting on the user's first day of the week. */
export function WeekdayChart({ data, className }) {
  const { t } = useTranslation();
  const format = useFormat();
  const rateText = useRateText();
  const ordered = Array.from(
    { length: 7 },
    (_, index) => data.habits.byWeekday[(data.weekStart - 1 + index) % 7],
  );
  const rows = ordered.map((day) => ({
    key: String(day.weekday),
    label: format.weekdayName(day.weekday, 'short'),
    title: format.weekdayName(day.weekday),
    value: day.rate === null ? null : percentOf(day.rate),
    display: day.rate === null ? t('analytics:charts.habits.nothingDue') : rateText(day.rate),
    detail:
      day.due === 0
        ? ''
        : t('analytics:charts.habits.tooltip', {
            done: format.number(day.completed),
            total: format.number(day.due),
          }),
  }));
  return (
    <ChartPanel
      title={t('analytics:charts.weekday.title')}
      explain={t('analytics:charts.weekday.explain')}
      className={className}
    >
      <BarSeries
        rows={rows}
        scale="percent"
        color="var(--pfy-success)"
        caption={t('analytics:charts.weekday.caption')}
        columns={{
          step: t('analytics:charts.weekday.day'),
          value: t('analytics:charts.habits.rate'),
          detail: t('analytics:charts.habits.column'),
        }}
      />
    </ChartPanel>
  );
}

function Meter({ value, color, label }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-2"
    >
      <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
    </div>
  );
}

/** Every habit of the period in its own unit, most reliable first. */
export function HabitTable({ data }) {
  const { t } = useTranslation();
  const format = useFormat();
  const rateText = useRateText();
  const { items } = data.habits;
  return (
    <Panel title={t('analytics:habits.title')} description={t('analytics:habits.description')}>
      {items.length === 0 ? (
        <p className="py-4 text-center text-body text-ink-2">{t('analytics:habits.empty')}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[30rem] border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-line text-caption text-ink-2">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('analytics:habits.name')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('analytics:habits.completed')}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t('analytics:habits.missed')}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('analytics:habits.rate')}
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  {t('analytics:habits.previous')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((habit) => (
                <tr key={habit.habitId} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2.5 pr-3 font-medium">
                    <span className="flex items-center gap-3">
                      <ItemBadge icon={habit.icon} color={habit.color} size="sm" />
                      <span className="min-w-0">
                        <Link
                          to={`/habits/${habit.habitId}`}
                          className="text-ink hover:text-accent hover:underline"
                        >
                          {habit.name}
                        </Link>
                        {habit.archived && (
                          <Badge className="ml-2">{t('analytics:habits.archived')}</Badge>
                        )}
                      </span>
                    </span>
                  </th>
                  <td className="px-3 py-2.5 whitespace-nowrap text-ink-2 tabular-nums">
                    {t(`analytics:habits.unit.${habit.unit}`, {
                      done: format.number(habit.completed),
                      total: format.number(habit.due),
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right text-ink-2 tabular-nums">
                    {format.number(habit.missed)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-3">
                      {habit.rate !== null && (
                        <Meter
                          value={percentOf(habit.rate)}
                          color={habit.color}
                          label={t('analytics:habits.progressLabel', {
                            name: habit.name,
                            value: percentOf(habit.rate),
                          })}
                        />
                      )}
                      <span className="w-12 shrink-0 text-right font-medium text-ink tabular-nums">
                        {rateText(habit.rate)}
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right text-ink-2 tabular-nums">
                    {rateText(habit.previousRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** A labelled list of counts, each drawn as a share of the largest one. */
function ShareList({ title, rows }) {
  const { t } = useTranslation();
  const format = useFormat();
  const largest = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div>
      <h3 className="mb-2 text-caption font-medium text-ink-2">{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3 text-body">
            <span className="flex w-32 shrink-0 items-center gap-2 truncate text-ink">
              {row.color && (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              )}
              <span className="truncate">{row.name}</span>
            </span>
            <Meter
              value={Math.round((row.count / largest) * 100)}
              color="var(--pfy-accent)"
              label={t('analytics:tasks.shareLabel', { name: row.name, count: row.count })}
            />
            <span className="w-8 shrink-0 text-right font-medium text-ink tabular-nums">
              {format.number(row.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the finished tasks of the period were: by due date, priority and category. */
export function TaskBreakdown({ data, className }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { tasks } = data;
  const facts = [
    {
      key: 'due',
      label: t('analytics:tasks.due'),
      value: t('analytics:tasks.dueValue', {
        done: format.number(tasks.dueCompleted),
        total: format.number(tasks.due),
      }),
    },
    { key: 'late', label: t('analytics:tasks.late'), value: format.number(tasks.late) },
    {
      key: 'withoutDueDate',
      label: t('analytics:tasks.withoutDueDate'),
      value: format.number(tasks.withoutDueDate),
    },
    {
      key: 'overdueOpen',
      label: t('analytics:tasks.overdueOpen'),
      value: format.number(tasks.overdueOpen),
    },
  ];
  return (
    <Panel
      title={t('analytics:tasks.title')}
      description={t('analytics:tasks.description')}
      className={className}
    >
      <dl className="flex flex-col">
        {facts.map((fact) => (
          <div
            key={fact.key}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-body first:pt-0"
          >
            <dt className="text-ink-2">{fact.label}</dt>
            <dd className="text-right font-medium text-ink tabular-nums">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {tasks.completed === 0 ? (
        <p className="pt-4 text-center text-body text-ink-2">{t('analytics:tasks.empty')}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-5">
          <ShareList
            title={t('analytics:tasks.byPriority')}
            rows={tasks.byPriority.map((row) => ({
              key: row.priority,
              name: t(`tasks:priority.${row.priority}`),
              count: row.completed,
            }))}
          />
          <ShareList
            title={t('analytics:tasks.byCategory')}
            rows={tasks.byCategory.map((row) => ({
              key: row.categoryId ?? 'none',
              name: row.name ?? t('analytics:tasks.uncategorized'),
              color: row.color,
              count: row.completed,
            }))}
          />
        </div>
      )}
    </Panel>
  );
}

const PACE_TONES = { ahead: 'success', on_track: 'accent', behind: 'warning' };

function deadlineText(t, daysLeft) {
  if (daysLeft === null) return t('analytics:goals.noTarget');
  if (daysLeft === 0) return t('analytics:goals.dueToday');
  return daysLeft > 0
    ? t('analytics:goals.daysLeft', { count: daysLeft })
    : t('analytics:goals.overdue', { count: -daysLeft });
}

/** Active goals: progress, the progress time alone would predict, and what moved. */
export function GoalList({ data, className }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { goals } = data;
  return (
    <Panel
      title={t('analytics:goals.title')}
      description={t('analytics:goals.description')}
      actions={<Explain text={t('analytics:goals.paceRule')} />}
      className={className}
    >
      {goals.items.length === 0 ? (
        <p className="py-4 text-center text-body text-ink-2">{t('analytics:goals.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {goals.items.map((goal) => (
            <li key={goal.goalId} className="border-b border-line py-3 first:pt-0 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link
                  to={`/goals/${goal.goalId}`}
                  className="min-w-0 truncate text-body font-medium text-ink hover:text-accent hover:underline"
                >
                  {goal.title}
                </Link>
                {goal.pace && (
                  <Badge tone={PACE_TONES[goal.pace]}>
                    {t(`analytics:goals.pace.${goal.pace}`)}
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Meter
                  value={goal.percent}
                  color={goal.color}
                  label={t('analytics:goals.progressLabel', { title: goal.title })}
                />
                <span className="w-12 shrink-0 text-right text-caption font-medium text-ink tabular-nums">
                  {t('analytics:percent', { value: format.number(Math.round(goal.percent)) })}
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-ink-2">
                <span>{deadlineText(t, goal.daysLeft)}</span>
                {goal.expected !== null && (
                  <span>
                    {t('analytics:goals.expected', { value: format.number(goal.expected) })}
                  </span>
                )}
                {goal.milestonesCompleted > 0 && (
                  <span>
                    {t('analytics:goals.milestones', { count: goal.milestonesCompleted })}
                  </span>
                )}
                {goal.tasksCompleted > 0 && (
                  <span>{t('analytics:goals.tasks', { count: goal.tasksCompleted })}</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const HIGHLIGHT_ICONS = { positive: Sparkles, neutral: Info, attention: TriangleAlert };
const HIGHLIGHT_COLORS = {
  positive: 'bg-success-soft text-success',
  neutral: 'bg-accent-soft text-accent',
  attention: 'bg-warning-soft text-warning',
};

/** The written report of the period: what stands out, each line with its rule. */
export function Highlights({ data, actions }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <Panel
      title={t('analytics:highlights.title')}
      description={t('analytics:highlights.description')}
      actions={actions}
    >
      {data.highlights.length === 0 ? (
        <p className="py-2 text-body text-ink-2">{t('analytics:highlights.empty')}</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {data.highlights.map((highlight) => {
            const Icon = HIGHLIGHT_ICONS[highlight.tone];
            const { params } = highlight;
            const values = {
              ...params,
              date: params.date ? format.calendarWeekdayDate(params.date) : undefined,
              weekday: params.weekday ? format.weekdayName(params.weekday) : undefined,
            };
            return (
              <li key={highlight.kind} className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    HIGHLIGHT_COLORS[highlight.tone],
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 pt-1 text-body text-ink">
                  {t(`analytics:highlights.${highlight.kind}.text`, values)}
                </p>
                <Explain text={t(`analytics:highlights.${highlight.kind}.rule`)} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
