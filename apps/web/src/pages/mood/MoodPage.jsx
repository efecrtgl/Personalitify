import { MOOD_EMOTIONS, MOOD_SCORES } from '@personalitify/shared-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Angry, ChevronLeft, ChevronRight, Frown, Laugh, Meh, Smile } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarSeries } from '../../charts/BarSeries.jsx';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { addDays, currentDateInZone, eachDate, startOfWeek } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Card, PageHeader, Panel } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { Field, Textarea } from '../../ui/fields.jsx';
import { ChipToggleGroup } from '../../ui/pickers.jsx';
import { useToast } from '../../ui/toast.jsx';

const SCORE_ICONS = { 1: Angry, 2: Frown, 3: Meh, 4: Smile, 5: Laugh };

/** One hue from light to dark: a darker cell is a better day. The score is also written. */
const scoreFill = (score) =>
  `color-mix(in srgb, var(--pfy-accent) ${[14, 30, 48, 68, 88][score - 1]}%, var(--pfy-surface))`;

const firstOfMonth = (date) => `${date.slice(0, 7)}-01`;
function lastOfMonth(date) {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function ScorePicker({ value, onChange }) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-caption font-medium text-ink">
        {t('mood:entry.scoreLabel')}
      </legend>
      <div className="grid grid-cols-5 gap-2">
        {MOOD_SCORES.map((score) => {
          const Icon = SCORE_ICONS[score];
          const selected = value === score;
          return (
            <label
              key={score}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1.5 rounded-control px-1 py-3 text-center text-caption font-medium transition-colors select-none',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                selected
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={name}
                value={score}
                checked={selected}
                onChange={() => onChange(score)}
                className="sr-only"
              />
              <Icon className="size-6" aria-hidden="true" />
              {t(`mood:score.${score}`)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The form for one day. Remounted when the day or its stored entry changes. */
function EntryForm({ date, entry, isToday }) {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [score, setScore] = useState(entry?.score ?? null);
  const [emotions, setEmotions] = useState(entry?.emotions ?? []);
  const [note, setNote] = useState(entry?.note ?? '');
  const [missing, setMissing] = useState(false);

  const done = (message) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: queryKeys.mood.all });
  };
  const save = useMutation({
    mutationFn: () => api.mood.set(date, { score, emotions, note: note.trim() }),
    onSuccess: () => done(t('mood:entry.saved')),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.mood.clear(date),
    onSuccess: () => done(t('mood:entry.removed')),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = (event) => {
    event.preventDefault();
    if (score === null) {
      setMissing(true);
      return;
    }
    save.mutate();
  };

  return (
    <Card as="form" onSubmit={submit} className="flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="text-heading font-semibold text-ink">
        {isToday
          ? t('mood:entry.today')
          : t('mood:entry.forDate', { date: format.calendarWeekdayDate(date) })}
      </h2>
      <div>
        <ScorePicker
          value={score}
          onChange={(value) => {
            setScore(value);
            setMissing(false);
          }}
        />
        {missing && (
          <p role="alert" className="mt-2 text-caption text-danger">
            {t('mood:entry.chooseScore')}
          </p>
        )}
      </div>
      <ChipToggleGroup
        label={t('mood:entry.emotions')}
        values={emotions}
        onChange={setEmotions}
        options={MOOD_EMOTIONS.map((emotion) => ({
          value: emotion,
          label: t(`mood:emotion.${emotion}`),
        }))}
      />
      <Field label={t('mood:entry.note')} optional>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            maxLength={1000}
            value={note}
            placeholder={t('mood:entry.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {entry ? (
          <Button
            variant="danger-ghost"
            loading={remove.isPending}
            disabled={save.isPending}
            onClick={() => remove.mutate()}
          >
            {t('mood:entry.remove')}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          type="submit"
          loading={save.isPending}
          disabled={remove.isPending}
        >
          {t('mood:entry.save')}
        </Button>
      </div>
    </Card>
  );
}

function MonthGrid({ month, today, weekStart, entries, selected, onSelect }) {
  const { t } = useTranslation();
  const format = useFormat();
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const from = startOfWeek(month, weekStart);
  const last = lastOfMonth(month);
  const to = addDays(startOfWeek(last, weekStart), 6);
  const days = eachDate(from, to);

  return (
    <div role="group" aria-label={t('mood:month.caption', { month: format.calendarMonth(month) })}>
      <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-caption text-ink-3">
        {days.slice(0, 7).map((date) => (
          <span key={date} aria-hidden="true">
            {format.weekdayName(
              ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1,
              'narrow',
            )}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((date) => {
          if (date < month || date > last) return <span key={date} />;
          const entry = byDate.get(date);
          const label = entry
            ? t('mood:month.day', {
                date: format.calendarWeekdayDate(date),
                score: t(`mood:score.${entry.score}`),
              })
            : t('mood:month.dayEmpty', { date: format.calendarWeekdayDate(date) });
          return (
            <button
              key={date}
              type="button"
              aria-label={label}
              aria-pressed={date === selected}
              disabled={date > today}
              onClick={() => onSelect(date)}
              style={entry ? { backgroundColor: scoreFill(entry.score) } : undefined}
              className={cn(
                'flex aspect-square flex-col items-center justify-center rounded-control text-caption transition-shadow',
                'disabled:opacity-40',
                entry
                  ? entry.score >= 4
                    ? 'text-on-accent'
                    : 'text-ink'
                  : 'bg-surface-2 text-ink-2 enabled:hover:bg-surface-3',
                date === selected && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                date === today && 'font-semibold',
              )}
            >
              <span aria-hidden="true">{Number(date.slice(8))}</span>
              {entry && (
                <span aria-hidden="true" className="text-[0.65rem] leading-none opacity-80">
                  {entry.score}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ summary, weekStart }) {
  const { t } = useTranslation();
  const format = useFormat();
  if (summary.count === 0) {
    return <p className="py-2 text-body text-ink-2">{t('mood:summary.empty')}</p>;
  }
  const largest = Math.max(1, ...summary.distribution.map((row) => row.count));
  const weekdays = Array.from(
    { length: 7 },
    (_, index) => summary.byWeekday[(weekStart - 1 + index) % 7],
  );
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-caption font-medium text-ink-2">{t('mood:summary.average')}</p>
        <p className="text-display font-semibold text-ink tabular-nums">
          {t('mood:summary.averageValue', { value: format.number(summary.average) })}
        </p>
        <p className="text-caption text-ink-2">
          {t('mood:summary.days', { count: summary.count })}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-caption font-medium text-ink-2">
          {t('mood:summary.distribution')}
        </h3>
        <ul className="flex flex-col gap-2">
          {[...summary.distribution].reverse().map((row) => {
            const name = t(`mood:score.${row.score}`);
            return (
              <li key={row.score} className="flex items-center gap-3 text-body">
                <span className="w-20 shrink-0 text-ink">{name}</span>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={largest}
                  aria-valuenow={row.count}
                  aria-label={t('mood:summary.distributionLabel', { name, count: row.count })}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(row.count / largest) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right font-medium text-ink tabular-nums">
                  {format.number(row.count)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {summary.emotions.length > 0 && (
        <div>
          <h3 className="mb-2 text-caption font-medium text-ink-2">{t('mood:summary.emotions')}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {summary.emotions.slice(0, 6).map((row) => (
              <li
                key={row.emotion}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink"
              >
                {t('mood:summary.emotionCount', {
                  name: t(`mood:emotion.${row.emotion}`),
                  count: row.count,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-caption font-medium text-ink-2">
          {t('mood:summary.weekday.title')}
        </h3>
        <BarSeries
          rows={weekdays.map((day) => ({
            key: String(day.weekday),
            label: format.weekdayName(day.weekday, 'short'),
            title: format.weekdayName(day.weekday),
            value: day.average,
            display:
              day.average === null
                ? t('mood:summary.weekday.none')
                : t('mood:summary.averageValue', { value: format.number(day.average) }),
            detail: t('mood:summary.weekday.countValue', { count: day.count }),
          }))}
          scale="count"
          max={5}
          color="var(--pfy-accent)"
          height="h-36"
          caption={t('mood:summary.weekday.caption')}
          columns={{
            step: t('mood:summary.weekday.day'),
            value: t('mood:summary.weekday.average'),
            detail: t('mood:summary.weekday.count'),
          }}
        />
        <p className="mt-3 text-caption text-ink-3">{t('mood:summary.weekday.explain')}</p>
      </div>
    </div>
  );
}

export function MoodPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const { settings } = useAuth();
  const deviceToday = currentDateInZone(settings.timeZone);
  const [month, setMonth] = useState(() => firstOfMonth(deviceToday));
  const [selected, setSelected] = useState(null);

  const to = lastOfMonth(month);
  const range = useQuery({
    queryKey: queryKeys.mood.range(month, to),
    queryFn: () => api.mood.range({ from: month, to }),
  });
  const data = range.data;
  const today = data?.today ?? deviceToday;
  const date = selected ?? today;
  const entry = data?.entries.find((candidate) => candidate.date === date) ?? null;
  const showsToday = firstOfMonth(today) === month;

  const go = (target) => {
    setMonth(target);
    setSelected(firstOfMonth(today) === target ? null : target);
  };

  return (
    <>
      <PageHeader title={t('mood:title')} description={t('mood:description')} />
      {range.isPending ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      ) : range.isError ? (
        <ErrorState description={errorMessage(range.error)} onRetry={range.refetch} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-5">
            <EntryForm
              key={`${date}:${entry?.version ?? 'new'}`}
              date={date}
              entry={entry}
              isToday={date === today}
            />
            <Panel
              title={<span className="first-letter:uppercase">{format.calendarMonth(month)}</span>}
              actions={
                <>
                  <IconButton
                    icon={ChevronLeft}
                    size="sm"
                    label={t('mood:month.previous')}
                    onClick={() => go(firstOfMonth(addDays(month, -1)))}
                  />
                  <IconButton
                    icon={ChevronRight}
                    size="sm"
                    label={t('mood:month.next')}
                    disabled={showsToday}
                    onClick={() => go(addDays(to, 1))}
                  />
                </>
              }
            >
              <MonthGrid
                month={month}
                today={today}
                weekStart={settings.weekStart}
                entries={data.entries}
                selected={date}
                onSelect={setSelected}
              />
              <p className="mt-3 text-caption text-ink-3">{t('mood:month.explain')}</p>
            </Panel>
          </div>
          <Panel title={t('mood:summary.title')}>
            <Summary summary={data.summary} weekStart={settings.weekStart} />
          </Panel>
        </div>
      )}
    </>
  );
}
