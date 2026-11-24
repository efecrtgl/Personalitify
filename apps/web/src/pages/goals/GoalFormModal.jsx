import { GOAL_HORIZONS, GOAL_PROGRESS_MODES, ITEM_COLORS } from '@personalitify/shared-contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { Button } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Select, Textarea } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { ChipToggleGroup, ColorPicker, IconPicker } from '../../ui/pickers.jsx';
import { useCategories, useHabitList } from '../habits/useHabits.js';
import { useGoalActions } from './useGoals.js';

function initialState(goal, defaults) {
  if (!goal) {
    return {
      title: '',
      description: '',
      color: ITEM_COLORS[7],
      icon: 'target',
      categoryId: '',
      horizon: 'short',
      startDate: defaults.startDate ?? '',
      targetDate: '',
      mode: 'manual',
      target: 100,
      unit: '',
      habitIds: [],
    };
  }
  return {
    title: goal.title,
    description: goal.description,
    color: goal.color,
    icon: goal.icon,
    categoryId: goal.categoryId ?? '',
    horizon: goal.horizon,
    startDate: goal.startDate,
    targetDate: goal.targetDate ?? '',
    mode: goal.progress.mode,
    target: goal.progress.target,
    unit: goal.progress.unit,
    habitIds: goal.habitIds,
  };
}

function toRequest(state) {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    color: state.color,
    icon: state.icon,
    categoryId: state.categoryId || null,
    horizon: state.horizon,
    startDate: state.startDate || undefined,
    targetDate: state.targetDate || null,
    progress:
      state.mode === 'metric'
        ? { mode: 'metric', target: Number(state.target), unit: state.unit.trim() }
        : { mode: state.mode },
    habitIds: state.habitIds,
  };
}

/** Creates a goal (optionally as a sub-goal of `defaults.parentGoalId`) or edits one. */
export function GoalFormModal({ goal, defaults = {}, onClose }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const habits = useHabitList('false');
  const { create, update } = useGoalActions();
  const [state, setState] = useState(() => initialState(goal, defaults));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const saving = create.isPending || update.isPending;

  const set = (patch) => {
    setState((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const validate = () => {
    const found = {};
    if (!state.title.trim()) found.title = t('errors:validation.required');
    if (state.targetDate && state.startDate && state.targetDate < state.startDate) {
      found.targetDate = t('errors:validation.end_before_start');
    }
    if (state.mode === 'metric' && !(Number(state.target) > 0)) {
      found['progress.target'] = t('errors:validation.too_small_number', { minimum: 1 });
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
      if (goal) {
        await update.mutateAsync({
          id: goal.id,
          patch: { ...toRequest(state), baseVersion: goal.version },
        });
      } else {
        await create.mutateAsync({
          ...toRequest(state),
          parentGoalId: defaults.parentGoalId ?? null,
        });
      }
      onClose();
    } catch (error) {
      const fieldErrors = error?.fieldErrors ?? {};
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFormError(error);
    }
  };

  const title = goal
    ? t('goals:form.editTitle')
    : defaults.parentGoalId
      ? t('goals:form.newSubGoalTitle')
      : t('goals:form.newTitle');

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {t(goal ? 'common:save' : 'goals:form.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        {formError && <Banner tone="danger">{errorMessage(formError)}</Banner>}

        <section className="flex flex-col gap-4">
          <Field label={t('goals:form.title')} error={errors.title}>
            {(props) => (
              <Input
                maxLength={120}
                placeholder={t('goals:form.titlePlaceholder')}
                value={state.title}
                onChange={(event) => set({ title: event.target.value })}
                {...props}
              />
            )}
          </Field>
          <Field
            label={t('goals:form.description')}
            hint={t('goals:form.descriptionHint')}
            optional
            error={errors.description}
          >
            {(props) => (
              <Textarea
                rows={3}
                maxLength={2000}
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
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('goals:form.timeTitle')}</h3>
          <SegmentedControl
            label={t('goals:form.horizon')}
            value={state.horizon}
            onChange={(horizon) => set({ horizon })}
            options={GOAL_HORIZONS.map((horizon) => ({
              value: horizon,
              label: t(`goals:horizon.${horizon}`),
            }))}
            className="self-start"
          />
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <Field label={t('goals:form.startDate')} error={errors.startDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.startDate}
                  onChange={(event) => set({ startDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('goals:form.targetDate')} optional error={errors.targetDate}>
              {(props) => (
                <Input
                  type="date"
                  min={state.startDate || undefined}
                  value={state.targetDate}
                  onChange={(event) => set({ targetDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('goals:form.progressTitle')}</h3>
          <Field
            label={t('goals:form.mode')}
            hint={t(`goals:form.modeHints.${state.mode}`)}
            className="sm:max-w-sm"
          >
            {(props) => (
              <Select
                value={state.mode}
                onChange={(event) => set({ mode: event.target.value })}
                options={GOAL_PROGRESS_MODES.map((mode) => ({
                  value: mode,
                  label: t(`goals:form.modes.${mode}`),
                }))}
                {...props}
              />
            )}
          </Field>
          {state.mode === 'metric' && (
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field label={t('goals:form.metricTarget')} error={errors['progress.target']}>
                {(props) => (
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={state.target}
                    onChange={(event) => set({ target: event.target.value })}
                    {...props}
                  />
                )}
              </Field>
              <Field label={t('goals:form.metricUnit')} optional error={errors['progress.unit']}>
                {(props) => (
                  <Input
                    maxLength={20}
                    placeholder={t('goals:form.metricUnitPlaceholder')}
                    value={state.unit}
                    onChange={(event) => set({ unit: event.target.value })}
                    {...props}
                  />
                )}
              </Field>
            </div>
          )}
        </section>

        {(categories.data?.length > 0 || habits.data?.length > 0) && (
          <section className="flex flex-col gap-4 border-t border-line pt-5">
            {categories.data?.length > 0 && (
              <Field
                label={t('habits:form.category')}
                error={errors.categoryId}
                className="sm:max-w-sm"
              >
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
            {habits.data?.length > 0 && (
              <div>
                <ChipToggleGroup
                  label={t('goals:form.habits')}
                  options={habits.data.map((habit) => ({ value: habit.id, label: habit.name }))}
                  values={state.habitIds}
                  onChange={(habitIds) => set({ habitIds })}
                />
                <p className="mt-1.5 text-caption text-ink-3">{t('goals:form.habitsHint')}</p>
              </div>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
