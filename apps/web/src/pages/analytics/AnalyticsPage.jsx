import { ANALYTICS_PERIODS } from '@personalitify/shared-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { addDays } from '../../lib/dates.js';
import { downloadText, toCsv } from '../../lib/download.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { PageHeader } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { SegmentedControl } from '../../ui/fields.jsx';
import {
  GoalList,
  HabitRateChart,
  HabitTable,
  Highlights,
  KeyFigures,
  TaskBreakdown,
  TasksChart,
  WeekdayChart,
  percentOf,
} from './sections.jsx';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The name of a period: "November 2026", "Q4 2026", "2026", or a range of dates for a week. */
function periodTitle(t, format, data) {
  const { period, range } = data;
  const year = range.from.slice(0, 4);
  if (period === 'month') return format.calendarMonth(range.from);
  if (period === 'year') return year;
  if (period === 'quarter') {
    return t('analytics:quarterTitle', {
      year,
      quarter: Math.floor((Number(range.from.slice(5, 7)) - 1) / 3) + 1,
    });
  }
  return t('analytics:rangeTitle', {
    from: format.calendarShortDate(range.from),
    to: format.calendarDate(range.to),
  });
}

/** The step-by-step series of the period as a spreadsheet. */
function seriesCsv(t, data) {
  return toCsv([
    [
      t('analytics:export.from'),
      t('analytics:export.to'),
      t('analytics:export.habitsDue'),
      t('analytics:export.habitsCompleted'),
      t('analytics:export.habitRate'),
      t('analytics:export.tasksCompleted'),
    ],
    ...data.series.map((step) => [
      step.from,
      step.to,
      step.habits.due,
      step.habits.completed,
      step.habits.rate === null ? '' : percentOf(step.habits.rate),
      step.tasks.completed,
    ]),
  ]);
}

export function AnalyticsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get('period');
  const period = ANALYTICS_PERIODS.includes(requested) ? requested : 'month';
  const date = DATE.test(searchParams.get('date') ?? '') ? searchParams.get('date') : undefined;

  const overview = useQuery({
    queryKey: queryKeys.analytics.overview(period, date),
    queryFn: () => api.analytics.overview({ period, date }),
    // Moving between periods keeps the previous figures on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
  const data = overview.data;

  const show = (nextPeriod, nextDate) =>
    setSearchParams(
      {
        ...(nextPeriod === 'month' ? {} : { period: nextPeriod }),
        ...(nextDate ? { date: nextDate } : {}),
      },
      { replace: true },
    );

  // The period that holds today is the last one: there is nothing to count in the future.
  const isCurrent = data ? data.range.from <= data.today && data.today <= data.range.to : true;

  return (
    <>
      <PageHeader title={t('analytics:title')} description={t('analytics:description')} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <SegmentedControl
          label={t('analytics:periodLabel')}
          value={period}
          onChange={(value) => show(value, undefined)}
          options={ANALYTICS_PERIODS.map((value) => ({
            value,
            label: t(`analytics:period.${value}`),
          }))}
        />
        <div className="flex items-center gap-1">
          {!isCurrent && (
            <Button size="sm" onClick={() => show(period, undefined)}>
              {t('analytics:nav.current')}
            </Button>
          )}
          <IconButton
            icon={ChevronLeft}
            label={t('analytics:nav.previous')}
            disabled={!data}
            onClick={() => show(period, addDays(data.range.from, -1))}
          />
          <IconButton
            icon={ChevronRight}
            label={t('analytics:nav.next')}
            disabled={!data || isCurrent}
            onClick={() => show(period, addDays(data.range.to, 1))}
          />
        </div>
      </div>

      {overview.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-card" />
          ))}
          <Skeleton className="h-64 rounded-card sm:col-span-2 lg:col-span-4" />
        </div>
      ) : overview.isError ? (
        <ErrorState description={errorMessage(overview.error)} onRetry={overview.refetch} />
      ) : (
        <div className="flex flex-col gap-5" aria-busy={overview.isPlaceholderData || undefined}>
          <div>
            <h2 className="text-title font-semibold text-ink first-letter:uppercase">
              {periodTitle(t, format, data)}
            </h2>
            {!data.complete && isCurrent && (
              <p className="mt-1 text-caption text-ink-2">{t('analytics:running')}</p>
            )}
          </div>

          <KeyFigures data={data} />

          <Highlights
            data={data}
            actions={
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  size="sm"
                  icon={Download}
                  onClick={() =>
                    downloadText(
                      `${t('analytics:export.fileName', data.range)}.csv`,
                      seriesCsv(t, data),
                    )
                  }
                >
                  {t('analytics:export.csv')}
                </Button>
                <Button size="sm" icon={Printer} onClick={() => window.print()}>
                  {t('analytics:export.print')}
                </Button>
              </div>
            }
          />

          <HabitRateChart data={data} />
          <div className="grid gap-5 lg:grid-cols-2">
            <TasksChart data={data} />
            <WeekdayChart data={data} />
          </div>
          <HabitTable data={data} />
          <div className="grid gap-5 lg:grid-cols-2">
            <TaskBreakdown data={data} />
            <GoalList data={data} />
          </div>
        </div>
      )}
    </>
  );
}
