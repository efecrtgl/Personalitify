import { ITEM_COLORS } from '@personalitify/shared-contracts';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { useFormat } from '../../lib/format.js';
import { REPEAT_CHOICES, recurrenceOf, repeatOf } from '../../lib/recurrenceForm.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Select, Textarea } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { ChipToggleGroup, ColorPicker, IconPicker } from '../../ui/pickers.jsx';
import { useCategories, useHabitActions } from './useHabits.js';

const MAX_REMINDERS = 8;
function initialState(habit, defaultStartDate) {
  if (!habit) {
    return {
      name: '',
      description: '',
      icon: 'star',
      color: ITEM_COLORS[0],
      categoryId: '',
      mode: 'fixed',
      repeat: 'daily',
      interval: 2,
      weekdays: [1, 2, 3, 4, 5],
      monthDays: [1],
      period: 'week',
      timesPerPeriod: 3,
      targetKind: 'check',
      targetValue: 1,
      targetUnit: '',
      startDate: defaultStartDate ?? '',
      endDate: '',
      reminders: [],
      streakGoal: '',
    };
  }
  const { schedule, target } = habit;
  const repeat = repeatOf(schedule.recurrence);
  return {
    name: habit.name,
    description: habit.description,
    icon: habit.icon,
    color: habit.color,
    categoryId: habit.categoryId ?? '',
    mode: schedule.mode,
    repeat,
    interval: repeat === 'interval' ? schedule.recurrence.interval : 2,
    weekdays: schedule.recurrence.weekdays.length ? schedule.recurrence.weekdays : [1],
    monthDays: schedule.recurrence.monthDays.length ? schedule.recurrence.monthDays : [1],
    period: schedule.period,
    timesPerPeriod: schedule.timesPerPeriod,
    targetKind: target.kind,
    targetValue: target.value,
    targetUnit: target.unit,
    startDate: habit.startDate,
    endDate: habit.endDate ?? '',
    reminders: habit.reminders.map((reminder) => reminder.time),
    streakGoal: habit.streakGoal ?? '',
  };
}

/** The request body for the API, built from the form's state. */
function toRequest(state) {
  return {
    name: state.name.trim(),
    description: state.description.trim(),
    icon: state.icon,
    color: state.color,
    categoryId: state.categoryId || null,
    schedule: {
      mode: state.mode,
      recurrence: recurrenceOf(state),
      period: state.period,
      timesPerPeriod: Number(state.timesPerPeriod),
    },
    target: {
      kind: state.targetKind,
      value: state.targetKind === 'check' ? 1 : Number(state.targetValue),
      unit: state.targetKind === 'count' ? state.targetUnit.trim() : '',
    },
    startDate: state.startDate || undefined,
    endDate: state.endDate || null,
    reminders: state.reminders.map((time) => ({ time, enabled: true })),
    streakGoal: state.streakGoal === '' ? null : Number(state.streakGoal),
  };
}

/** Creates a habit, or edits the one passed as `habit`. */
export function HabitFormModal({ habit, defaultStartDate, onClose }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const { create, update } = useHabitActions();
  const [state, setState] = useState(() => initialState(habit, defaultStartDate));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const saving = create.isPending || update.isPending;

  const set = (patch) => {
    setState((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const validate = () => {
    const found = {};
    const required = t('errors:validation.required');
    if (!state.name.trim()) found.name = required;
    if (state.mode === 'fixed' && state.repeat === 'weekdays' && state.weekdays.length === 0) {
      found.weekdays = t('habits:form.errors.chooseDay');
    }
    if (state.mode === 'fixed' && state.repeat === 'monthly' && state.monthDays.length === 0) {
      found.monthDays = t('habits:form.errors.chooseDay');
    }
    if (state.targetKind !== 'check' && !(Number(state.targetValue) >= 1)) {
      found['target.value'] = t('errors:validation.too_small_number', { minimum: 1 });
    }
    if (state.endDate && state.startDate && state.endDate < state.startDate) {
      found.endDate = t('errors:validation.end_before_start');
    }
    return found;
  };

  const submit = async (event) => {
    event?.preventDefault();
    if (saving) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    try {
      if (habit) {
        await update.mutateAsync({
          id: habit.id,
          patch: { ...toRequest(state), baseVersion: habit.version },
        });
      } else {
        await create.mutateAsync(toRequest(state));
      }
      onClose();
    } catch (error) {
      const fieldErrors = error?.fieldErrors ?? {};
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFormError(error);
    }
  };

  const weekdayOptions = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    value: weekday,
    label: format.weekdayName(weekday, 'short'),
    title: format.weekdayName(weekday, 'long'),
  }));
  const monthDayOptions = [
    ...Array.from({ length: 31 }, (_, index) => ({
      value: index + 1,
      label: String(index + 1),
      title: t('habits:form.dayOfMonth', { day: index + 1 }),
    })),
    { value: -1, label: t('habits:form.lastDay'), title: t('habits:form.lastDay') },
  ];
  const usedReminder = (time) => state.reminders.includes(time);
  const addReminder = () => {
    const candidates = ['09:00', '12:00', '18:00', '21:00', '07:00', '15:00', '20:00', '22:00'];
    set({ reminders: [...state.reminders, candidates.find((time) => !usedReminder(time))] });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t(habit ? 'habits:form.editTitle' : 'habits:form.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {t(habit ? 'common:save' : 'habits:form.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        {formError && <Banner tone="danger">{errorMessage(formError)}</Banner>}

        <section className="flex flex-col gap-4">
          <Field label={t('habits:form.name')} error={errors.name}>
            {(props) => (
              <Input
                autoFocus
                maxLength={80}
                placeholder={t('habits:form.namePlaceholder')}
                value={state.name}
                onChange={(event) => set({ name: event.target.value })}
                {...props}
              />
            )}
          </Field>
          <Field label={t('habits:form.description')} optional error={errors.description}>
            {(props) => (
              <Textarea
                rows={2}
                maxLength={500}
                value={state.description}
                onChange={(event) => set({ description: event.target.value })}
                {...props}
              />
            )}
          </Field>
          <ColorPicker
            label={t('habits:form.color')}
            value={state.color}
            onChange={(color) => set({ color })}
          />
          <IconPicker
            label={t('habits:form.icon')}
            value={state.icon}
            color={state.color}
            onChange={(icon) => set({ icon })}
          />
          {categories.data?.length > 0 && (
            <Field label={t('habits:form.category')} error={errors.categoryId}>
              {(props) => (
                <Select
                  value={state.categoryId}
                  onChange={(event) => set({ categoryId: event.target.value })}
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
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('habits:form.scheduleTitle')}</h3>
          <SegmentedControl
            label={t('habits:form.scheduleTitle')}
            value={state.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'fixed', label: t('habits:form.modeFixed') },
              { value: 'flexible', label: t('habits:form.modeFlexible') },
            ]}
            className="self-start"
          />

          {state.mode === 'fixed' ? (
            <>
              <Field label={t('habits:form.repeat')}>
                {(props) => (
                  <Select
                    value={state.repeat}
                    onChange={(event) => set({ repeat: event.target.value })}
                    options={REPEAT_CHOICES.map((repeat) => ({
                      value: repeat,
                      label: t(`habits:form.repeats.${repeat}`),
                    }))}
                    {...props}
                  />
                )}
              </Field>
              {state.repeat === 'weekdays' && (
                <div>
                  <ChipToggleGroup
                    label={t('habits:form.weekdays')}
                    options={weekdayOptions}
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
                <Field
                  label={t('habits:form.intervalDays')}
                  error={errors['schedule.recurrence.interval']}
                >
                  {(props) => (
                    <Input
                      type="number"
                      min={2}
                      max={365}
                      value={state.interval}
                      onChange={(event) => set({ interval: event.target.value })}
                      className="max-w-32"
                      {...props}
                    />
                  )}
                </Field>
              )}
              {state.repeat === 'monthly' && (
                <div>
                  <ChipToggleGroup
                    label={t('habits:form.monthDays')}
                    options={monthDayOptions}
                    values={state.monthDays}
                    onChange={(monthDays) => set({ monthDays })}
                  />
                  <p className="mt-1.5 text-caption text-ink-3">{t('habits:form.monthDaysHint')}</p>
                  {errors.monthDays && (
                    <p role="alert" className="mt-1.5 text-caption text-danger">
                      {errors.monthDays}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field
                label={t('habits:form.timesPerPeriod')}
                error={errors['schedule.timesPerPeriod']}
              >
                {(props) => (
                  <Input
                    type="number"
                    min={1}
                    max={state.period === 'week' ? 7 : 31}
                    value={state.timesPerPeriod}
                    onChange={(event) => set({ timesPerPeriod: event.target.value })}
                    {...props}
                  />
                )}
              </Field>
              <Field label={t('habits:form.period')}>
                {(props) => (
                  <Select
                    value={state.period}
                    onChange={(event) => set({ period: event.target.value })}
                    options={['week', 'month'].map((period) => ({
                      value: period,
                      label: t(`habits:form.periods.${period}`),
                    }))}
                    {...props}
                  />
                )}
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Field label={t('habits:form.startDate')} error={errors.startDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.startDate}
                  onChange={(event) => set({ startDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('habits:form.endDate')} optional error={errors.endDate}>
              {(props) => (
                <Input
                  type="date"
                  min={state.startDate || undefined}
                  value={state.endDate}
                  onChange={(event) => set({ endDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('habits:form.targetTitle')}</h3>
          <SegmentedControl
            label={t('habits:form.targetTitle')}
            value={state.targetKind}
            onChange={(targetKind) => set({ targetKind })}
            options={['check', 'count', 'duration'].map((kind) => ({
              value: kind,
              label: t(`habits:form.targetKinds.${kind}`),
            }))}
            className="self-start"
          />
          {state.targetKind !== 'check' && (
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field
                label={t(
                  state.targetKind === 'duration'
                    ? 'habits:form.minutesPerDay'
                    : 'habits:form.countPerDay',
                )}
                error={errors['target.value']}
              >
                {(props) => (
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    value={state.targetValue}
                    onChange={(event) => set({ targetValue: event.target.value })}
                    {...props}
                  />
                )}
              </Field>
              {state.targetKind === 'count' && (
                <Field label={t('habits:form.unit')} optional error={errors['target.unit']}>
                  {(props) => (
                    <Input
                      maxLength={20}
                      placeholder={t('habits:form.unitPlaceholder')}
                      value={state.targetUnit}
                      onChange={(event) => set({ targetUnit: event.target.value })}
                      {...props}
                    />
                  )}
                </Field>
              )}
            </div>
          )}
          <Field
            label={t('habits:form.streakGoal')}
            hint={t('habits:form.streakGoalHint')}
            optional
            error={errors.streakGoal}
            className="sm:max-w-44"
          >
            {(props) => (
              <Input
                type="number"
                min={1}
                max={3650}
                value={state.streakGoal}
                onChange={(event) => set({ streakGoal: event.target.value })}
                {...props}
              />
            )}
          </Field>
        </section>

        <section className="flex flex-col gap-3 border-t border-line pt-5">
          <div>
            <h3 className="text-heading font-semibold text-ink">
              {t('habits:form.remindersTitle')}
            </h3>
            <p className="mt-0.5 text-caption text-ink-2">{t('habits:form.remindersHint')}</p>
          </div>
          {errors.reminders && (
            <p role="alert" className="text-caption text-danger">
              {errors.reminders}
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {state.reminders.map((time, index) => (
              <li key={index} className="flex items-center gap-1">
                <Input
                  type="time"
                  aria-label={t('habits:form.reminderTime', { number: index + 1 })}
                  value={time}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    const reminders = [...state.reminders];
                    reminders[index] = event.target.value;
                    set({ reminders });
                  }}
                  className="w-32"
                />
                <IconButton
                  icon={X}
                  size="sm"
                  label={t('habits:form.removeReminder', { number: index + 1 })}
                  onClick={() =>
                    set({ reminders: state.reminders.filter((_, other) => other !== index) })
                  }
                />
              </li>
            ))}
          </ul>
          {state.reminders.length < MAX_REMINDERS && (
            <Button size="sm" icon={Plus} onClick={addReminder} className="self-start">
              {t('habits:form.addReminder')}
            </Button>
          )}
        </section>
      </form>
    </Modal>
  );
}
