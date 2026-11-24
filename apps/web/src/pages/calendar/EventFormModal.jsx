import { CALENDAR_EVENT_KINDS } from '@personalitify/shared-contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { useFormat } from '../../lib/format.js';
import { REPEAT_CHOICES, recurrenceOf, repeatOf } from '../../lib/recurrenceForm.js';
import { toMinutes, toTime } from '../../calendar/layout.js';
import { Button } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Select, Switch, Textarea } from '../../ui/fields.jsx';
import { ConfirmDialog, Modal } from '../../ui/overlays.jsx';
import { ChipToggleGroup, ColorPicker } from '../../ui/pickers.jsx';
import { useCategories } from '../habits/useHabits.js';

const REMINDER_CHOICES = [0, 10, 30, 60, 1440];

function initialState(event, defaults) {
  if (!event) {
    const startTime = defaults.startTime ?? '09:00';
    return {
      title: '',
      kind: 'event',
      allDay: defaults.allDay ?? false,
      startDate: defaults.date,
      startTime,
      endDate: defaults.date,
      endTime: toTime(Math.min(toMinutes(startTime) + 60, 23 * 60 + 59)),
      repeat: 'none',
      interval: 2,
      weekdays: [1, 2, 3, 4, 5],
      monthDays: [1],
      recurrenceEndDate: '',
      location: '',
      description: '',
      categoryId: '',
      color: '',
      reminder: '',
    };
  }
  const repeat = event.recurrence ? repeatOf(event.recurrence) : 'none';
  return {
    title: event.title,
    kind: event.kind,
    allDay: event.allDay,
    startDate: event.startDate,
    startTime: event.startTime ?? '09:00',
    endDate: event.endDate,
    endTime: event.endTime ?? '10:00',
    repeat,
    interval: repeat === 'interval' ? event.recurrence.interval : 2,
    weekdays: event.recurrence?.weekdays.length ? event.recurrence.weekdays : [1],
    monthDays: event.recurrence?.monthDays.length ? event.recurrence.monthDays : [1],
    recurrenceEndDate: event.recurrenceEndDate ?? '',
    location: event.location,
    description: event.description,
    categoryId: event.categoryId ?? '',
    color: event.color ?? '',
    reminder: event.reminderMinutes.length ? String(event.reminderMinutes[0]) : '',
  };
}

function toRequest(state) {
  return {
    title: state.title.trim(),
    kind: state.kind,
    allDay: state.allDay,
    startDate: state.startDate,
    startTime: state.allDay ? null : state.startTime,
    endDate: state.endDate || state.startDate,
    endTime: state.allDay ? null : state.endTime,
    recurrence: state.repeat === 'none' ? null : recurrenceOf(state),
    recurrenceEndDate: state.repeat === 'none' ? null : state.recurrenceEndDate || null,
    location: state.location.trim(),
    description: state.description.trim(),
    categoryId: state.categoryId || null,
    color: state.color || null,
    reminderMinutes: state.reminder === '' ? [] : [Number(state.reminder)],
  };
}

/**
 * Creates an event or edits one. Editing a repeating event changes the whole series;
 * `occurrenceDate` identifies the occurrence the editor was opened from, which can be
 * removed on its own.
 */
export function EventFormModal({ event, occurrenceDate, defaults = {}, actions, onClose }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const [state, setState] = useState(() => initialState(event, defaults));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const saving = actions.save.isPending;

  const set = (patch) => {
    setState((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const validate = () => {
    const found = {};
    if (!state.title.trim()) found.title = t('errors:validation.required');
    if (state.endDate && state.endDate < state.startDate) {
      found.endDate = t('errors:validation.end_before_start');
    }
    if (!state.allDay && (state.endDate || state.startDate) === state.startDate) {
      if (state.endTime <= state.startTime) found.endTime = t('errors:validation.end_before_start');
    }
    if (state.repeat === 'weekdays' && state.weekdays.length === 0) {
      found.weekdays = t('habits:form.errors.chooseDay');
    }
    return found;
  };

  const submit = async (submitEvent) => {
    submitEvent?.preventDefault();
    if (saving) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    try {
      await actions.save.mutateAsync(
        event
          ? { id: event.id, patch: { ...toRequest(state), baseVersion: event.version } }
          : { input: toRequest(state) },
      );
      onClose();
    } catch (error) {
      const fieldErrors = error?.fieldErrors ?? {};
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFormError(error);
    }
  };

  const remove = () => {
    const variables =
      confirming === 'occurrence' ? { id: event.id, occurrenceDate } : { id: event.id };
    actions.remove.mutate(variables, { onSuccess: onClose, onSettled: () => setConfirming(null) });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={t(event ? 'calendar:form.editTitle' : 'calendar:form.newTitle')}
        description={event?.recurrence ? t('calendar:form.seriesNote') : undefined}
        footer={
          <>
            {event?.recurrence && occurrenceDate && (
              <Button variant="danger-ghost" onClick={() => setConfirming('occurrence')}>
                {t('calendar:form.deleteOccurrence')}
              </Button>
            )}
            {event && (
              <Button
                variant="danger-ghost"
                onClick={() => setConfirming('event')}
                className="mr-auto"
              >
                {t(event.recurrence ? 'calendar:form.deleteSeries' : 'calendar:form.delete')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {t('common:cancel')}
            </Button>
            <Button variant="primary" onClick={submit} loading={saving}>
              {t(event ? 'common:save' : 'calendar:form.create')}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          {formError && <Banner tone="danger">{errorMessage(formError)}</Banner>}
          <Field label={t('calendar:form.title')} error={errors.title}>
            {(props) => (
              <Input
                maxLength={160}
                value={state.title}
                onChange={(change) => set({ title: change.target.value })}
                {...props}
              />
            )}
          </Field>
          <SegmentedControl
            label={t('calendar:form.kind')}
            value={state.kind}
            onChange={(kind) => set({ kind })}
            options={CALENDAR_EVENT_KINDS.map((kind) => ({
              value: kind,
              label: t(`calendar:eventKinds.${kind}`),
            }))}
            className="self-start"
          />
          <Switch
            label={t('calendar:form.allDay')}
            checked={state.allDay}
            onChange={(allDay) => set({ allDay })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('calendar:form.startDate')} error={errors.startDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.startDate}
                  onChange={(change) => {
                    const startDate = change.target.value;
                    // Keep the end on or after the start while the start is being changed.
                    set({
                      startDate,
                      endDate: state.endDate < startDate ? startDate : state.endDate,
                    });
                  }}
                  {...props}
                />
              )}
            </Field>
            {!state.allDay && (
              <Field label={t('calendar:form.startTime')} error={errors.startTime}>
                {(props) => (
                  <Input
                    type="time"
                    value={state.startTime}
                    onChange={(change) => set({ startTime: change.target.value })}
                    {...props}
                  />
                )}
              </Field>
            )}
            <Field label={t('calendar:form.endDate')} error={errors.endDate}>
              {(props) => (
                <Input
                  type="date"
                  min={state.startDate}
                  value={state.endDate}
                  onChange={(change) => set({ endDate: change.target.value })}
                  {...props}
                />
              )}
            </Field>
            {!state.allDay && (
              <Field label={t('calendar:form.endTime')} error={errors.endTime}>
                {(props) => (
                  <Input
                    type="time"
                    value={state.endTime}
                    onChange={(change) => set({ endTime: change.target.value })}
                    {...props}
                  />
                )}
              </Field>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tasks:form.repeat')}>
              {(props) => (
                <Select
                  value={state.repeat}
                  onChange={(change) => set({ repeat: change.target.value })}
                  options={[
                    { value: 'none', label: t('tasks:form.repeatNone') },
                    ...REPEAT_CHOICES.map((repeat) => ({
                      value: repeat,
                      label: t(`habits:form.repeats.${repeat}`),
                    })),
                  ]}
                  {...props}
                />
              )}
            </Field>
            {state.repeat !== 'none' && (
              <Field label={t('tasks:form.repeatUntil')} optional error={errors.recurrenceEndDate}>
                {(props) => (
                  <Input
                    type="date"
                    min={state.startDate}
                    value={state.recurrenceEndDate}
                    onChange={(change) => set({ recurrenceEndDate: change.target.value })}
                    {...props}
                  />
                )}
              </Field>
            )}
          </div>
          {state.repeat === 'weekdays' && (
            <div>
              <ChipToggleGroup
                label={t('habits:form.weekdays')}
                options={[1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
                  value: weekday,
                  label: format.weekdayName(weekday, 'short'),
                  title: format.weekdayName(weekday, 'long'),
                }))}
                values={state.weekdays}
                onChange={(weekdays) => set({ weekdays })}
              />
              {errors.weekdays && (
                <p role="alert" className="mt-1.5 text-caption text-danger">
                  {errors.weekdays}
                </p>
              )}
            </div>
          )}
          {state.repeat === 'interval' && (
            <Field label={t('habits:form.intervalDays')} className="max-w-40">
              {(props) => (
                <Input
                  type="number"
                  min={2}
                  max={365}
                  value={state.interval}
                  onChange={(change) => set({ interval: change.target.value })}
                  {...props}
                />
              )}
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('calendar:form.location')} optional error={errors.location}>
              {(props) => (
                <Input
                  maxLength={200}
                  value={state.location}
                  onChange={(change) => set({ location: change.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('calendar:form.reminder')}>
              {(props) => (
                <Select
                  value={state.reminder}
                  onChange={(change) => set({ reminder: change.target.value })}
                  options={[
                    { value: '', label: t('calendar:form.reminders.none') },
                    ...REMINDER_CHOICES.map((minutes) => ({
                      value: String(minutes),
                      label: t(`calendar:form.reminders.${minutes}`),
                    })),
                  ]}
                  {...props}
                />
              )}
            </Field>
          </div>
          <Field label={t('calendar:form.description')} optional error={errors.description}>
            {(props) => (
              <Textarea
                rows={2}
                maxLength={4000}
                value={state.description}
                onChange={(change) => set({ description: change.target.value })}
                {...props}
              />
            )}
          </Field>
          {categories.data?.length > 0 && (
            <Field
              label={t('habits:form.category')}
              error={errors.categoryId}
              className="sm:max-w-sm"
            >
              {(props) => (
                <Select
                  value={state.categoryId}
                  onChange={(change) => set({ categoryId: change.target.value })}
                  options={[
                    { value: '', label: t('habits:form.noCategory') },
                    ...categories.data.map((category) => ({
                      value: category.id,
                      label: category.name,
                    })),
                  ]}
                  {...props}
                />
              )}
            </Field>
          )}
          <ColorPicker
            label={t('habits:form.color')}
            value={state.color}
            onChange={(color) => set({ color })}
          />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={remove}
        loading={actions.remove.isPending}
        title={t(
          confirming === 'occurrence'
            ? 'calendar:delete.occurrenceTitle'
            : event?.recurrence
              ? 'calendar:delete.seriesTitle'
              : 'calendar:delete.title',
          { title: event?.title },
        )}
        description={t(
          confirming === 'occurrence'
            ? 'calendar:delete.occurrenceDescription'
            : event?.recurrence
              ? 'calendar:delete.seriesDescription'
              : 'calendar:delete.description',
        )}
        confirmLabel={t('calendar:form.delete')}
      />
    </>
  );
}
