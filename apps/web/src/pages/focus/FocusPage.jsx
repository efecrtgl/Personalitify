import { FOCUS_KINDS, FOCUS_LIMITS } from '@personalitify/shared-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Square, Timer, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarSeries } from '../../charts/BarSeries.jsx';
import { useErrorMessage, useUpdateSettings } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { weekdayOf } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Badge, Card, PageHeader, Panel } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Select } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { useToast } from '../../ui/toast.jsx';

const LENGTH_OF_KIND = {
  focus: 'focusMinutes',
  short_break: 'shortBreakMinutes',
  long_break: 'longBreakMinutes',
};
const STATUS_TONES = { running: 'accent', paused: 'warning', completed: 'success' };

/** `mm:ss`, or `h:mm:ss` from an hour on. */
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const pad = (value) => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const rest = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/** The current time, refreshed twice a second while `active`. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const RADIUS = 108;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function TimerRing({ remaining, total, label, paused }) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  return (
    <div className="relative mx-auto flex size-60 items-center justify-center">
      <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden="true">
        <circle
          cx="120"
          cy="120"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          className="stroke-surface-2"
        />
        <circle
          cx="120"
          cy="120"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-linear',
            paused ? 'stroke-warning' : 'stroke-accent',
          )}
        />
      </svg>
      <p
        role="timer"
        aria-label={label}
        className="absolute text-[3.25rem] leading-none font-semibold text-ink tabular-nums"
      >
        {formatClock(remaining)}
      </p>
    </div>
  );
}

function LengthsDialog({ settings, onClose }) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const [values, setValues] = useState(() => ({ ...settings }));
  const fields = [
    ['focusMinutes', FOCUS_LIMITS.maxMinutes],
    ['shortBreakMinutes', FOCUS_LIMITS.maxMinutes],
    ['longBreakMinutes', FOCUS_LIMITS.maxMinutes],
    ['longBreakEvery', FOCUS_LIMITS.maxLongBreakEvery],
  ];
  const valid = (name, max) =>
    Number.isInteger(Number(values[name])) &&
    values[name] !== '' &&
    values[name] >= 1 &&
    values[name] <= max;
  const allValid = fields.every(([name, max]) => valid(name, max));

  const submit = (event) => {
    event.preventDefault();
    if (!allValid) return;
    const focus = Object.fromEntries(fields.map(([name]) => [name, Number(values[name])]));
    update.mutate({ focus }, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('focus:lengths.title')}
      description={t('focus:lengths.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="focus-lengths"
            loading={update.isPending}
            disabled={!allValid}
          >
            {t('common:save')}
          </Button>
        </>
      }
    >
      <form id="focus-lengths" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {fields.map(([name, max]) => (
          <Field
            key={name}
            label={t(`focus:lengths.${name}`)}
            error={valid(name, max) ? undefined : t('focus:lengths.range', { min: 1, max })}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                step={1}
                value={values[name]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [name]: event.target.value === '' ? '' : Number(event.target.value),
                  }))
                }
              />
            )}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

function History() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.focus.sessions(1),
    queryFn: () => api.focus.sessions({ limit: 10 }),
  });
  const remove = useMutation({
    mutationFn: (sessionId) => api.focus.remove(sessionId),
    onSuccess: () => {
      toast.success(t('focus:history.deleted'));
      queryClient.invalidateQueries({ queryKey: queryKeys.focus.all });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = sessions.data?.items ?? [];
  return (
    <Panel title={t('focus:history.title')}>
      {sessions.isPending ? (
        <Skeleton className="h-24 rounded-control" />
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-body text-ink-2">{t('focus:history.empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((session) => (
            <li
              key={session.id}
              className="flex items-center gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">
                  {t(`focus:kind.${session.kind}`)}
                  {session.note && (
                    <span className="ml-2 font-normal text-ink-2">{session.note}</span>
                  )}
                </p>
                <p className="text-caption text-ink-2">{format.dateTime(session.startedAt)}</p>
              </div>
              <span className="shrink-0 text-body text-ink tabular-nums">
                {t('focus:history.duration', { count: Math.round(session.elapsedSeconds / 60) })}
              </span>
              <Badge tone={STATUS_TONES[session.status] ?? 'neutral'}>
                {t(`focus:status.${session.status}`)}
              </Badge>
              <IconButton
                icon={Trash2}
                size="sm"
                label={t('focus:history.delete', { kind: t(`focus:kind.${session.kind}`) })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(session.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function FocusPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [chosenKind, setChosenKind] = useState(null);
  const [taskId, setTaskId] = useState('');
  const [editingLengths, setEditingLengths] = useState(false);
  const finishing = useRef(null);

  const focus = useQuery({ queryKey: queryKeys.focus.state, queryFn: () => api.focus.state() });
  const tasks = useQuery({ queryKey: queryKeys.tasks.day(), queryFn: () => api.tasks.day() });
  const data = focus.data;
  const session = data?.session ?? null;
  const running = session?.status === 'running';
  const now = useNow(running);

  // Countdowns follow the server's clock: the difference to this device's clock is taken
  // when the state arrives and applied to every tick.
  const clockOffset = data ? Date.parse(data.serverTime) - focus.dataUpdatedAt : 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.focus.all });
  const showSession = (updated) => {
    queryClient.setQueryData(queryKeys.focus.state, (current) =>
      current
        ? {
            ...current,
            serverTime: new Date(Date.now() + clockOffset).toISOString(),
            session: updated.endedAt ? null : updated,
          }
        : current,
    );
    refresh();
  };
  const onError = (error) => {
    toast.error(errorMessage(error));
    refresh();
  };

  const start = useMutation({
    mutationFn: (input) => api.focus.start(input),
    onSuccess: showSession,
    onError: (error) => {
      if (error?.code === 'INVALID_STATE') {
        toast.info(t('focus:toast.activeElsewhere'));
        refresh();
      } else onError(error);
    },
  });
  const transition = useMutation({
    mutationFn: ({ action, sessionId }) => api.focus[action](sessionId),
    onSuccess: (updated, { action, announce }) => {
      if (action === 'complete' && announce) {
        toast.success(
          t(updated.kind === 'focus' ? 'focus:toast.focusDone' : 'focus:toast.breakDone'),
        );
      }
      showSession(updated);
    },
    onError,
  });

  const kind = session?.kind ?? chosenKind ?? data?.suggestedKind ?? 'focus';
  const total = session
    ? session.plannedMinutes * 60
    : (data?.settings[LENGTH_OF_KIND[kind]] ?? 0) * 60;
  let remaining = total;
  if (running) {
    remaining = Math.ceil((Date.parse(session.endsAt) - (now + clockOffset)) / 1000);
  } else if (session) {
    remaining = total - session.elapsedSeconds;
  }
  remaining = Math.max(0, remaining);

  // The moment the countdown reaches zero the session is reported as finished, once. The
  // server has the last word on the time; this only makes the screen follow without delay.
  const sessionId = session?.id;
  const { mutate: runTransition } = transition;
  useEffect(() => {
    if (running && remaining === 0 && finishing.current !== sessionId) {
      finishing.current = sessionId;
      runTransition({ action: 'complete', sessionId, announce: true });
    }
  }, [running, remaining, sessionId, runTransition]);

  const kindName = t(`focus:kind.${kind}`);
  useEffect(() => {
    if (!session) return undefined;
    const previous = document.title;
    document.title = t('focus:documentTitle', { time: formatClock(remaining), kind: kindName });
    return () => {
      document.title = previous;
    };
  }, [session, remaining, kindName, t]);

  const openTasks = [...(tasks.data?.overdue ?? []), ...(tasks.data?.due ?? [])];
  const linkedTask = openTasks.find((task) => task.id === (session?.taskId ?? taskId));
  const busy = start.isPending || transition.isPending;
  const act = (action) => transition.mutate({ action, sessionId: session.id });

  return (
    <>
      <PageHeader
        title={t('focus:title')}
        description={t('focus:description')}
        actions={
          <Button icon={Timer} onClick={() => setEditingLengths(true)} disabled={!data}>
            {t('focus:actions.lengths')}
          </Button>
        }
      />

      {focus.isPending ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card" />
        </div>
      ) : focus.isError ? (
        <ErrorState description={errorMessage(focus.error)} onRetry={focus.refetch} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="flex flex-col items-center gap-5 p-6">
            {session ? (
              <div className="flex h-10 items-center gap-2">
                <span className="text-heading font-semibold text-ink">{kindName}</span>
                <Badge tone={STATUS_TONES[session.status]}>
                  {t(`focus:status.${session.status}`)}
                </Badge>
              </div>
            ) : (
              <SegmentedControl
                label={t('focus:kindLabel')}
                value={kind}
                onChange={setChosenKind}
                options={FOCUS_KINDS.map((value) => ({
                  value,
                  label: t(`focus:kind.${value}`),
                }))}
              />
            )}

            <TimerRing
              remaining={remaining}
              total={total}
              paused={session?.status === 'paused'}
              label={t('focus:timerLabel', {
                minutes: Math.floor(remaining / 60),
                seconds: remaining % 60,
              })}
            />

            <p className="text-caption text-ink-2">
              {session && linkedTask
                ? t('focus:task.working', { title: linkedTask.title })
                : t('focus:planned', { count: Math.round(total / 60) })}
            </p>

            {!session && kind === 'focus' && openTasks.length > 0 && (
              <Field label={t('focus:task.label')} optional className="w-full max-w-xs">
                {(control) => (
                  <Select
                    {...control}
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                    options={[
                      { value: '', label: t('focus:task.none') },
                      ...openTasks.map((task) => ({ value: task.id, label: task.title })),
                    ]}
                  />
                )}
              </Field>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2">
              {!session && (
                <Button
                  variant="primary"
                  size="lg"
                  icon={Play}
                  loading={start.isPending}
                  onClick={() =>
                    start.mutate({
                      kind,
                      ...(kind === 'focus' && taskId ? { taskId } : {}),
                    })
                  }
                >
                  {t('focus:actions.start')}
                </Button>
              )}
              {running && (
                <Button size="lg" icon={Pause} disabled={busy} onClick={() => act('pause')}>
                  {t('focus:actions.pause')}
                </Button>
              )}
              {session?.status === 'paused' && (
                <Button
                  variant="primary"
                  size="lg"
                  icon={Play}
                  disabled={busy}
                  onClick={() => act('resume')}
                >
                  {t('focus:actions.resume')}
                </Button>
              )}
              {session && (
                <>
                  <Button size="lg" icon={Square} disabled={busy} onClick={() => act('complete')}>
                    {t('focus:actions.complete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="lg"
                    icon={X}
                    disabled={busy}
                    onClick={() => act('cancel')}
                  >
                    {t('focus:actions.cancel')}
                  </Button>
                </>
              )}
            </div>
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <Panel title={t('focus:today.title')}>
              <p className="text-display font-semibold text-ink tabular-nums">
                {t('focus:today.minutes', { count: Math.round(data.todayFocus.seconds / 60) })}
              </p>
              <p className="mt-1 text-body text-ink-2">
                {t('focus:today.sessions', { count: data.todayFocus.sessions })}
              </p>
            </Panel>
            <Panel title={t('focus:week.title')}>
              <BarSeries
                rows={data.week.map((day) => ({
                  key: day.date,
                  label: format.weekdayName(weekdayOf(day.date), 'short'),
                  title: format.calendarWeekdayDate(day.date),
                  value: Math.round(day.seconds / 60),
                  display: t('focus:week.minutesValue', { count: Math.round(day.seconds / 60) }),
                  detail: t('focus:week.sessionsValue', { count: day.sessions }),
                }))}
                scale="count"
                color="var(--pfy-accent)"
                height="h-36"
                caption={t('focus:week.caption')}
                columns={{
                  step: t('focus:week.day'),
                  value: t('focus:week.minutes'),
                  detail: t('focus:week.sessions'),
                }}
              />
              <p className="mt-3 text-caption text-ink-3">{t('focus:week.explain')}</p>
            </Panel>
          </div>

          <div className="lg:col-span-2">
            <History />
          </div>
        </div>
      )}

      {editingLengths && data && (
        <LengthsDialog settings={data.settings} onClose={() => setEditingLengths(false)} />
      )}
    </>
  );
}
