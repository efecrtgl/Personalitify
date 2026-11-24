import { TASK_PRIORITIES } from '@personalitify/shared-contracts';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { REPEAT_CHOICES, recurrenceOf, repeatOf } from '../../lib/recurrenceForm.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Banner } from '../../ui/feedback.jsx';
import { Field, Input, SegmentedControl, Select, Textarea } from '../../ui/fields.jsx';
import { Modal } from '../../ui/overlays.jsx';
import { ChipToggleGroup } from '../../ui/pickers.jsx';
import { useCategories } from '../habits/useHabits.js';
import { useTaskActions } from './useTasks.js';

function initialState(task, defaults) {
  if (!task) {
    return {
      title: '',
      description: '',
      priority: 'none',
      dueDate: defaults.dueDate ?? '',
      dueTime: '',
      startDate: '',
      scheduledDate: '',
      scheduledTime: '',
      durationMinutes: '',
      repeat: 'none',
      interval: 2,
      weekdays: [1, 2, 3, 4, 5],
      monthDays: [1],
      recurrenceEndDate: '',
      categoryId: '',
      goalId: defaults.goalId ?? '',
      subtasks: [],
    };
  }
  const repeat = task.recurrence ? repeatOf(task.recurrence) : 'none';
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate ?? '',
    dueTime: task.dueTime ?? '',
    startDate: task.startDate ?? '',
    scheduledDate: task.scheduledDate ?? '',
    scheduledTime: task.scheduledTime ?? '',
    durationMinutes: task.durationMinutes ?? '',
    repeat,
    interval: repeat === 'interval' ? task.recurrence.interval : 2,
    weekdays: task.recurrence?.weekdays.length ? task.recurrence.weekdays : [1],
    monthDays: task.recurrence?.monthDays.length ? task.recurrence.monthDays : [1],
    recurrenceEndDate: task.recurrenceEndDate ?? '',
    categoryId: task.categoryId ?? '',
    goalId: task.goalId ?? '',
    subtasks: [],
  };
}

/** The request body for the API, built from the form's state. */
function toRequest(state) {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    priority: state.priority,
    dueDate: state.dueDate || null,
    dueTime: state.dueDate && state.dueTime ? state.dueTime : null,
    startDate: state.startDate || null,
    scheduledDate: state.scheduledDate || null,
    scheduledTime: state.scheduledDate && state.scheduledTime ? state.scheduledTime : null,
    durationMinutes:
      state.scheduledDate && state.durationMinutes !== '' ? Number(state.durationMinutes) : null,
    recurrence: state.repeat === 'none' ? null : recurrenceOf(state),
    recurrenceEndDate: state.repeat === 'none' ? null : state.recurrenceEndDate || null,
    categoryId: state.categoryId || null,
    goalId: state.goalId || null,
  };
}

/** The checklist of an existing task; every change is saved at once. */
function SubtaskEditor({ task }) {
  const { t } = useTranslation();
  const { subtask } = useTaskActions();
  const detail = useQuery({
    queryKey: [...queryKeys.tasks.all, 'detail', task.id],
    queryFn: () => api.tasks.get(task.id),
    initialData: task,
  });
  const current = detail.data;
  const [title, setTitle] = useState('');

  const run = (variables) =>
    subtask.mutate({ taskId: task.id, ...variables }, { onSuccess: () => detail.refetch() });
  const add = () => {
    if (!title.trim()) return;
    run({ title: title.trim() });
    setTitle('');
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {current.subtasks.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-control px-1 py-1">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => run({ subtaskId: item.id, patch: { done: !item.done } })}
                className="size-4 accent-(--pfy-success)"
              />
              <span className={cn('truncate text-body', item.done && 'text-ink-3 line-through')}>
                {item.title}
              </span>
            </label>
            <IconButton
              icon={X}
              size="sm"
              label={t('tasks:form.removeSubtask', { title: item.title })}
              onClick={() => run({ subtaskId: item.id, remove: true })}
            />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          aria-label={t('tasks:form.newSubtask')}
          placeholder={t('tasks:form.newSubtask')}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button icon={Plus} onClick={add} disabled={!title.trim()}>
          {t('tasks:form.addSubtask')}
        </Button>
      </div>
    </div>
  );
}

/** Creates a task, or edits the one passed as `task`. */
export function TaskFormModal({ task, defaults = {}, onClose }) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const categories = useCategories();
  const goals = useQuery({
    queryKey: queryKeys.goals.list({ status: 'open' }),
    queryFn: () => api.goals.list({ status: 'open' }),
  });
  const { create, update } = useTaskActions();
  const [state, setState] = useState(() => initialState(task, defaults));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [newSubtask, setNewSubtask] = useState('');
  const saving = create.isPending || update.isPending;

  const set = (patch) => {
    setState((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const validate = () => {
    const found = {};
    if (!state.title.trim()) found.title = t('errors:validation.required');
    if (state.repeat !== 'none' && !state.dueDate) {
      found.dueDate = t('tasks:form.errors.repeatNeedsDate');
    }
    if (state.repeat === 'weekdays' && state.weekdays.length === 0) {
      found.weekdays = t('habits:form.errors.chooseDay');
    }
    if (state.startDate && state.dueDate && state.dueDate < state.startDate) {
      found.dueDate = t('errors:validation.end_before_start');
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
      if (task) {
        await update.mutateAsync({
          id: task.id,
          patch: { ...toRequest(state), baseVersion: task.version },
        });
      } else {
        await create.mutateAsync({
          ...toRequest(state),
          subtasks: state.subtasks.map((title) => ({ title })),
        });
      }
      onClose();
    } catch (error) {
      const fieldErrors = error?.fieldErrors ?? {};
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFormError(error);
    }
  };

  const addDraftSubtask = () => {
    if (!newSubtask.trim()) return;
    set({ subtasks: [...state.subtasks, newSubtask.trim()] });
    setNewSubtask('');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t(task ? 'tasks:form.editTitle' : 'tasks:form.newTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {t(task ? 'common:save' : 'tasks:form.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        {formError && <Banner tone="danger">{errorMessage(formError)}</Banner>}

        <section className="flex flex-col gap-4">
          <Field label={t('tasks:form.title')} error={errors.title}>
            {(props) => (
              <Input
                maxLength={200}
                value={state.title}
                onChange={(event) => set({ title: event.target.value })}
                {...props}
              />
            )}
          </Field>
          <Field label={t('tasks:form.description')} optional error={errors.description}>
            {(props) => (
              <Textarea
                rows={3}
                maxLength={4000}
                value={state.description}
                onChange={(event) => set({ description: event.target.value })}
                {...props}
              />
            )}
          </Field>
          <div>
            <p className="mb-2 text-caption font-medium text-ink">{t('tasks:form.priority')}</p>
            <SegmentedControl
              label={t('tasks:form.priority')}
              value={state.priority}
              onChange={(priority) => set({ priority })}
              options={TASK_PRIORITIES.map((priority) => ({
                value: priority,
                label: t(`tasks:priority.${priority}`),
              }))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('tasks:form.datesTitle')}</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t('tasks:form.dueDate')} optional error={errors.dueDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.dueDate}
                  onChange={(event) => set({ dueDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('tasks:form.dueTime')} optional error={errors.dueTime}>
              {(props) => (
                <Input
                  type="time"
                  disabled={!state.dueDate}
                  value={state.dueTime}
                  onChange={(event) => set({ dueTime: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('tasks:form.startDate')} optional error={errors.startDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.startDate}
                  onChange={(event) => set({ startDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          </div>

          <Field label={t('tasks:form.repeat')}>
            {(props) => (
              <Select
                value={state.repeat}
                onChange={(event) => set({ repeat: event.target.value })}
                options={[
                  { value: 'none', label: t('tasks:form.repeatNone') },
                  ...REPEAT_CHOICES.map((repeat) => ({
                    value: repeat,
                    label: t(`habits:form.repeats.${repeat}`),
                  })),
                ]}
                className="sm:max-w-xs"
                {...props}
              />
            )}
          </Field>
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
                  onChange={(event) => set({ interval: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          )}
          {state.repeat !== 'none' && (
            <Field
              label={t('tasks:form.repeatUntil')}
              hint={t('tasks:form.repeatHint')}
              optional
              error={errors.recurrenceEndDate}
              className="max-w-xs"
            >
              {(props) => (
                <Input
                  type="date"
                  min={state.dueDate || undefined}
                  value={state.recurrenceEndDate}
                  onChange={(event) => set({ recurrenceEndDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          )}
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <div>
            <h3 className="text-heading font-semibold text-ink">{t('tasks:form.planTitle')}</h3>
            <p className="mt-0.5 text-caption text-ink-2">{t('tasks:form.planHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={t('tasks:form.scheduledDate')} optional error={errors.scheduledDate}>
              {(props) => (
                <Input
                  type="date"
                  value={state.scheduledDate}
                  onChange={(event) => set({ scheduledDate: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('tasks:form.scheduledTime')} optional error={errors.scheduledTime}>
              {(props) => (
                <Input
                  type="time"
                  disabled={!state.scheduledDate}
                  value={state.scheduledTime}
                  onChange={(event) => set({ scheduledTime: event.target.value })}
                  {...props}
                />
              )}
            </Field>
            <Field label={t('tasks:form.duration')} optional error={errors.durationMinutes}>
              {(props) => (
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  step={5}
                  disabled={!state.scheduledDate}
                  value={state.durationMinutes}
                  onChange={(event) => set({ durationMinutes: event.target.value })}
                  {...props}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-line pt-5">
          <h3 className="text-heading font-semibold text-ink">{t('tasks:form.subtasksTitle')}</h3>
          {task ? (
            <SubtaskEditor task={task} />
          ) : (
            <>
              <ul className="flex flex-col gap-1">
                {state.subtasks.map((title, index) => (
                  <li key={`${title}-${index}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate px-1 text-body">{title}</span>
                    <IconButton
                      icon={X}
                      size="sm"
                      label={t('tasks:form.removeSubtask', { title })}
                      onClick={() =>
                        set({ subtasks: state.subtasks.filter((_, other) => other !== index) })
                      }
                    />
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  aria-label={t('tasks:form.newSubtask')}
                  placeholder={t('tasks:form.newSubtask')}
                  maxLength={200}
                  value={newSubtask}
                  onChange={(event) => setNewSubtask(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addDraftSubtask();
                    }
                  }}
                />
                <Button icon={Plus} onClick={addDraftSubtask} disabled={!newSubtask.trim()}>
                  {t('tasks:form.addSubtask')}
                </Button>
              </div>
            </>
          )}
        </section>

        {(categories.data?.length > 0 || goals.data?.length > 0) && (
          <section className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
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
            {goals.data?.length > 0 && (
              <Field label={t('tasks:form.goal')} error={errors.goalId}>
                {(props) => (
                  <Select
                    value={state.goalId}
                    onChange={(event) => set({ goalId: event.target.value })}
                    options={[
                      { value: '', label: t('tasks:form.noGoal') },
                      ...goals.data.map((goal) => ({ value: goal.id, label: goal.title })),
                    ]}
                    {...props}
                  />
                )}
              </Field>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
