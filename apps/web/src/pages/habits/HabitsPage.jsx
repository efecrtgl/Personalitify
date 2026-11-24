import { ChevronLeft, ChevronRight, Plus, Sprout } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { addDays } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Card, PageHeader } from '../../ui/display.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { LinkTabs } from '../../ui/LinkButton.jsx';
import { HabitDayCard } from './HabitDayCard.jsx';
import { HabitFormModal } from './HabitFormModal.jsx';
import { useHabitDay, useSetEntry } from './useHabits.js';

export const habitTabs = (t) => [
  { to: '/habits', label: t('habits:tabs.daily'), end: true },
  { to: '/habits/all', label: t('habits:tabs.all') },
];

/** Summary of the day: how many due habits are done, as a number and a bar. */
function DaySummary({ summary }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (summary.due === 0) return null;
  const percent = Math.round((summary.rate ?? 0) * 100);
  return (
    <Card className="mb-5 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body font-medium text-ink">
          {t('habits:day.progress', { completed: summary.completed, due: summary.due })}
        </p>
        <p className="text-title font-semibold text-ink tabular-nums">
          {t('habits:day.percent', { value: format.number(percent) })}
        </p>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={summary.due}
        aria-valuenow={summary.completed}
        aria-label={t('habits:day.progressLabel')}
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500 ease-standard"
          style={{ width: `${percent}%` }}
        />
      </div>
    </Card>
  );
}

export function HabitsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('date') ?? undefined;
  const [editing, setEditing] = useState(null);

  const day = useHabitDay(selected);
  const setEntry = useSetEntry(selected);
  const data = day.data;
  const date = data?.date;
  const today = data?.today;

  const goTo = (next) => setSearchParams(next && next !== today ? { date: next } : {});
  const title =
    !date || date === today
      ? t('habits:day.today')
      : date === addDays(today, -1)
        ? t('habits:day.yesterday')
        : date === addDays(today, 1)
          ? t('habits:day.tomorrow')
          : format.calendarWeekdayDate(date);

  const due = data?.items.filter((item) => item.due) ?? [];
  const other = data?.items.filter((item) => !item.due) ?? [];
  const renderList = (items) => (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <HabitDayCard
          key={item.habitId}
          item={item}
          today={today}
          onEdit={setEditing}
          onChange={(input) => setEntry.mutate({ item, input })}
        />
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title={t('habits:title')}
        description={t('habits:description')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            {t('habits:actions.new')}
          </Button>
        }
      />
      <LinkTabs label={t('habits:tabs.label')} tabs={habitTabs(t)} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-heading font-semibold text-ink first-letter:uppercase">
            {title}
          </h2>
          {date && <p className="text-caption text-ink-2">{format.calendarDate(date)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {date && date !== today && (
            <Button size="sm" onClick={() => goTo(today)}>
              {t('habits:day.goToToday')}
            </Button>
          )}
          <IconButton
            icon={ChevronLeft}
            label={t('habits:day.previous')}
            disabled={!date}
            onClick={() => goTo(addDays(date, -1))}
          />
          <IconButton
            icon={ChevronRight}
            label={t('habits:day.next')}
            disabled={!date}
            onClick={() => goTo(addDays(date, 1))}
          />
        </div>
      </div>

      {day.isPending ? (
        <SkeletonList rows={4} />
      ) : day.isError ? (
        <ErrorState description={errorMessage(day.error)} onRetry={day.refetch} />
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sprout}
            title={t('habits:empty.dayTitle')}
            description={t('habits:empty.dayDescription')}
            action={
              <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
                {t('habits:actions.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <DaySummary summary={data.summary} />
          {due.length > 0 && renderList(due)}
          {other.length > 0 && (
            <section className="mt-7">
              <h3 className="mb-3 text-caption font-semibold tracking-wide text-ink-2 uppercase">
                {t('habits:day.anytime')}
              </h3>
              {renderList(other)}
            </section>
          )}
        </>
      )}

      {editing && (
        <HabitFormModal
          habit={editing.id ? editing : null}
          defaultStartDate={today}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
