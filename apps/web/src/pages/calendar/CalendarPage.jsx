import { CALENDAR_ITEM_KINDS } from '@personalitify/shared-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { MonthView } from '../../calendar/MonthView.jsx';
import { TimeGridView } from '../../calendar/TimeGridView.jsx';
import { shiftAnchor, viewRange, weekDates } from '../../calendar/layout.js';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { currentDateInZone } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { useAuth } from '../../providers/AuthProvider.jsx';
import { Button, IconButton } from '../../ui/Button.jsx';
import { PageHeader } from '../../ui/display.jsx';
import { ErrorState, Skeleton } from '../../ui/feedback.jsx';
import { SegmentedControl } from '../../ui/fields.jsx';
import { ChipToggleGroup } from '../../ui/pickers.jsx';
import { useToast } from '../../ui/toast.jsx';
import { TaskFormModal } from '../tasks/TaskFormModal.jsx';
import { EventFormModal } from './EventFormModal.jsx';

const VIEWS = ['month', 'week', 'day'];
/** What the calendar holds when every kind of item is switched off. */
const NOTHING_SELECTED = { items: [], conflicts: [] };

/** Saving, moving and deleting calendar entries, with a warning when times overlap. */
function useCalendarActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { t } = useTranslation();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };
  const warnAboutConflicts = (result) => {
    if (result?.conflicts?.length > 0) {
      toast.info(
        t('calendar:conflict.warning', {
          count: result.conflicts.length,
          title: result.conflicts[0].title,
        }),
      );
    }
  };
  const onError = (error) => {
    if (error?.code !== 'VALIDATION_FAILED') toast.error(errorMessage(error));
  };

  return {
    save: useMutation({
      mutationFn: ({ id, patch, input }) =>
        id ? api.calendar.updateEvent(id, patch) : api.calendar.createEvent(input),
      onSuccess: (result) => {
        refresh();
        warnAboutConflicts(result);
      },
      onError,
    }),
    remove: useMutation({
      mutationFn: ({ id, occurrenceDate }) =>
        occurrenceDate
          ? api.calendar.removeOccurrence(id, occurrenceDate)
          : api.calendar.removeEvent(id),
      onSuccess: () => {
        refresh();
        toast.success(t('calendar:toast.deleted'));
      },
      onError,
    }),
    /** Drops an item on a new day (and time). Events and tasks are moved differently. */
    move: useMutation({
      mutationFn: ({ item, date, startTime }) => {
        if (item.kind === 'task') {
          return api.tasks.update(item.sourceId, {
            scheduledDate: date,
            ...(startTime ? { scheduledTime: startTime } : {}),
          });
        }
        return api.calendar.moveEvent(item.sourceId, {
          date,
          startTime,
          occurrenceDate: item.recurring ? item.occurrenceDate : undefined,
        });
      },
      onSuccess: (result) => {
        refresh();
        warnAboutConflicts(result);
      },
      onError,
    }),
  };
}

export function CalendarPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { settings } = useAuth();
  const toast = useToast();
  const actions = useCalendarActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [include, setInclude] = useState(CALENDAR_ITEM_KINDS);
  const [editor, setEditor] = useState(null);

  const view = VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : 'month';
  const date = searchParams.get('date') ?? currentDateInZone(settings.timeZone);
  const { from, to } = viewRange(view, date, settings.weekStart);
  const go = (next) => setSearchParams({ view, date, ...next });

  const calendar = useQuery({
    queryKey: queryKeys.calendar.range(from, to, include.join(',')),
    queryFn: () => api.calendar.get({ from, to, include }),
    placeholderData: (previous) => previous,
    enabled: include.length > 0,
  });
  const data = include.length > 0 ? calendar.data : NOTHING_SELECTED;
  const items = useMemo(() => data?.items ?? [], [data]);
  const conflictIds = useMemo(() => new Set((data?.conflicts ?? []).flat()), [data]);
  const today = data?.today;

  const title =
    view === 'day'
      ? format.calendarWeekdayDate(date)
      : view === 'week'
        ? `${format.calendarShortDate(from)} – ${format.calendarShortDate(to)}`
        : format.calendarMonth(date);

  const openItem = async (item) => {
    if (item.kind === 'habit') {
      navigate(`/habits/${item.sourceId}`);
    } else if (item.kind === 'task') {
      setEditor({ type: 'task', task: await api.tasks.get(item.sourceId) });
    } else {
      setEditor({
        type: 'event',
        event: await api.calendar.getEvent(item.sourceId),
        occurrenceDate: item.occurrenceDate,
      });
    }
  };
  const move = (item, target) => {
    if (!item || item.kind === 'habit') return;
    // Dropping an item where it already is changes nothing.
    if (item.date === target.date && (target.startTime ?? item.startTime) === item.startTime)
      return;
    actions.move.mutate({ item, ...target });
  };

  const shared = {
    today,
    items,
    conflictIds,
    format,
    onSelectItem: (item) => openItem(item).catch((error) => toast.error(errorMessage(error))),
    onOpenDay: (day) => go({ view: 'day', date: day }),
    onCreate: (defaults) => setEditor({ type: 'event', event: null, defaults }),
    onMove: move,
  };

  return (
    <>
      <PageHeader
        title={t('calendar:title')}
        description={t('calendar:description')}
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setEditor({ type: 'event', event: null, defaults: { date } })}
          >
            {t('calendar:actions.new')}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton
            icon={ChevronLeft}
            label={t(`calendar:previous.${view}`)}
            onClick={() => go({ date: shiftAnchor(view, date, -1) })}
          />
          <IconButton
            icon={ChevronRight}
            label={t(`calendar:next.${view}`)}
            onClick={() => go({ date: shiftAnchor(view, date, 1) })}
          />
          <h2 className="ml-1 truncate text-heading font-semibold text-ink first-letter:uppercase">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => go({ date: today ?? currentDateInZone(settings.timeZone) })}
          >
            {t('calendar:actions.today')}
          </Button>
          <SegmentedControl
            label={t('calendar:views.label')}
            value={view}
            onChange={(next) => go({ view: next })}
            options={VIEWS.map((value) => ({ value, label: t(`calendar:views.${value}`) }))}
          />
        </div>
      </div>

      <ChipToggleGroup
        label={t('calendar:show')}
        options={CALENDAR_ITEM_KINDS.map((kind) => ({
          value: kind,
          label: t(`calendar:kindsPlural.${kind}`),
        }))}
        values={include}
        onChange={(next) => setInclude(CALENDAR_ITEM_KINDS.filter((kind) => next.includes(kind)))}
        className="mb-4"
      />

      {calendar.isError ? (
        <ErrorState description={errorMessage(calendar.error)} onRetry={calendar.refetch} />
      ) : !data ? (
        <Skeleton className="h-96 rounded-card" />
      ) : view === 'month' ? (
        <MonthView date={date} weekStart={settings.weekStart} {...shared} />
      ) : (
        <TimeGridView
          dates={view === 'day' ? [date] : weekDates(date, settings.weekStart)}
          {...shared}
        />
      )}
      <p className="mt-3 text-caption text-ink-3">
        {t('calendar:hint', { zone: settings.timeZone.replaceAll('_', ' ') })}
      </p>

      {editor?.type === 'event' && (
        <EventFormModal
          event={editor.event}
          occurrenceDate={editor.occurrenceDate}
          defaults={editor.defaults}
          actions={actions}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === 'task' && (
        <TaskFormModal task={editor.task} onClose={() => setEditor(null)} />
      )}
    </>
  );
}
