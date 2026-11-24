import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleCheckBig,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { api, queryKeys } from '../../lib/api.js';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';
import { Button, IconButton } from '../../ui/Button.jsx';
import { Badge, Panel } from '../../ui/display.jsx';
import { ErrorState, Skeleton, SkeletonList } from '../../ui/feedback.jsx';
import { Field, Input, Select, Textarea } from '../../ui/fields.jsx';
import { ConfirmDialog } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { TaskFormModal } from '../tasks/TaskFormModal.jsx';
import { QuickAdd } from '../tasks/TasksPage.jsx';
import { TaskRow } from '../tasks/TaskRow.jsx';
import { useTaskActions, useTaskList } from '../tasks/useTasks.js';
import { GoalFormModal } from './GoalFormModal.jsx';
import { GoalProgressBar, describeDeadline } from './GoalProgress.jsx';
import { GoalCard } from './GoalsPage.jsx';
import { useGoalActions, useGoalDetail } from './useGoals.js';

/** Changes the progress of a goal, in the way its progress mode allows. */
function ProgressPanel({ goal }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { update } = useGoalActions();
  const { mode } = goal.progress;
  const [draft, setDraft] = useState(null);
  const save = (progress) =>
    update.mutate(
      { id: goal.id, patch: { progress, baseVersion: goal.version } },
      { onSettled: () => setDraft(null) },
    );

  return (
    <Panel title={t('goals:detail.progressTitle')} description={t(`goals:form.modeHints.${mode}`)}>
      <GoalProgressBar goal={goal} />
      {mode === 'manual' && (
        <div className="mt-5">
          <label htmlFor="goal-progress" className="text-caption font-medium text-ink">
            {t('goals:detail.setProgress')}
          </label>
          <input
            id="goal-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft ?? goal.progress.value}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={() => draft !== null && save({ value: draft })}
            onKeyUp={() => draft !== null && save({ value: draft })}
            className="mt-2 block w-full accent-(--pfy-accent)"
          />
        </div>
      )}
      {mode === 'metric' && (
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft !== null && draft !== '') save({ current: Number(draft) });
          }}
        >
          <Field
            label={t('goals:detail.current', {
              target: format.number(goal.progress.target),
              unit: goal.progress.unit,
            })}
            className="w-44"
          >
            {(props) => (
              <Input
                type="number"
                min={0}
                step="any"
                value={draft ?? goal.progress.current}
                onChange={(event) => setDraft(event.target.value)}
                {...props}
              />
            )}
          </Field>
          <Button type="submit" loading={update.isPending} disabled={draft === null}>
            {t('common:save')}
          </Button>
        </form>
      )}
    </Panel>
  );
}

function MilestonesPanel({ goal }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { milestone } = useGoalActions();
  const [title, setTitle] = useState('');
  const add = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    milestone.mutate(
      { goalId: goal.id, input: { title: title.trim() } },
      { onSuccess: () => setTitle('') },
    );
  };
  return (
    <Panel title={t('goals:detail.milestonesTitle')} description={t('goals:detail.milestonesHint')}>
      <ul className="flex flex-col gap-1">
        {goal.milestones.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-control px-1 py-1.5">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  milestone.mutate({
                    goalId: goal.id,
                    milestoneId: item.id,
                    patch: { done: !item.done },
                  })
                }
                className="size-4 accent-(--pfy-success)"
              />
              <span
                className={cn('min-w-0 truncate text-body', item.done && 'text-ink-3 line-through')}
              >
                {item.title}
              </span>
              {item.targetDate && (
                <span className="shrink-0 text-caption text-ink-2">
                  {format.calendarShortDate(item.targetDate)}
                </span>
              )}
            </label>
            <IconButton
              icon={X}
              size="sm"
              label={t('goals:detail.removeMilestone', { title: item.title })}
              onClick={() =>
                milestone.mutate({ goalId: goal.id, milestoneId: item.id, remove: true })
              }
            />
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Input
          aria-label={t('goals:detail.newMilestone')}
          placeholder={t('goals:detail.newMilestone')}
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" icon={Plus} disabled={!title.trim()} loading={milestone.isPending}>
          {t('goals:detail.addMilestone')}
        </Button>
      </form>
    </Panel>
  );
}

function TasksPanel({ goal }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const actions = useTaskActions();
  const [editing, setEditing] = useState(null);
  const tasks = useTaskList({ goalId: goal.id, status: 'all', sort: 'due', limit: 100 });
  return (
    <Panel title={t('goals:detail.tasksTitle')} description={t('goals:detail.tasksHint')}>
      <QuickAdd goalId={goal.id} actions={actions} />
      {tasks.isPending ? (
        <SkeletonList rows={2} />
      ) : tasks.isError ? (
        <ErrorState description={errorMessage(tasks.error)} onRetry={tasks.refetch} />
      ) : (
        tasks.data.items.length > 0 && (
          <ul className="-mx-4 -mb-2">
            {tasks.data.items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={tasks.data.meta.today}
                actions={actions}
                onEdit={setEditing}
              />
            ))}
          </ul>
        )
      )}
      {editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function ReviewsPanel({ goal }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { review } = useGoalActions();
  const [note, setNote] = useState('');
  const [rating, setRating] = useState('');
  const add = (event) => {
    event.preventDefault();
    if (!note.trim()) return;
    review.mutate(
      { goalId: goal.id, input: { note: note.trim(), rating: rating ? Number(rating) : null } },
      {
        onSuccess: () => {
          setNote('');
          setRating('');
        },
      },
    );
  };
  return (
    <Panel title={t('goals:detail.reviewsTitle')} description={t('goals:detail.reviewsHint')}>
      <form onSubmit={add} className="flex flex-col gap-3">
        <Textarea
          aria-label={t('goals:detail.reviewNote')}
          placeholder={t('goals:detail.reviewNote')}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('goals:detail.reviewRating')}
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            options={[
              { value: '', label: t('goals:detail.noRating') },
              ...[5, 4, 3, 2, 1].map((value) => ({
                value,
                label: t('goals:detail.rating', { count: value }),
              })),
            ]}
            className="w-44"
          />
          <Button type="submit" disabled={!note.trim()} loading={review.isPending}>
            {t('goals:detail.addReview')}
          </Button>
        </div>
      </form>
      {goal.reviews.length > 0 && (
        <ul className="mt-5 flex flex-col">
          {[...goal.reviews].reverse().map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 border-t border-line py-3 first:border-t-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
                  <span>{format.calendarDate(item.date)}</span>
                  <span>{t('goals:progress.percent', { value: Math.round(item.percent) })}</span>
                  {item.rating && (
                    <span className="inline-flex items-center gap-0.5 text-warning">
                      <Star className="size-3.5 fill-current" aria-hidden="true" />
                      {t('goals:detail.rating', { count: item.rating })}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-body whitespace-pre-wrap text-ink">{item.note}</p>
              </div>
              <IconButton
                icon={X}
                size="sm"
                label={t('goals:detail.removeReview')}
                onClick={() => review.mutate({ goalId: goal.id, reviewId: item.id })}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HistoryPanel({ goalId }) {
  const { t } = useTranslation();
  const format = useFormat();
  const history = useQuery({
    queryKey: queryKeys.goals.history(goalId),
    queryFn: () => api.goals.history(goalId),
  });
  if (!history.data || history.data.length === 0) return null;
  return (
    <Panel title={t('goals:detail.historyTitle')}>
      <ul className="flex flex-col">
        {history.data.slice(0, 12).map((entry) => (
          <li
            key={entry.eventId}
            className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span className="text-body text-ink">
              {entry.event === 'goal.created'
                ? t('goals:history.created')
                : t('goals:history.updated', {
                    fields: entry.changedFields
                      .map((field) => t(`goals:fields.${field}`, { defaultValue: field }))
                      .join(', '),
                  })}
            </span>
            <time dateTime={entry.at} className="text-caption text-ink-2">
              {format.dateTime(entry.at)}
            </time>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function GoalDetailPage() {
  const { t } = useTranslation();
  const { goalId } = useParams();
  const navigate = useNavigate();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const detail = useGoalDetail(goalId);
  const actions = useGoalActions();
  const [editing, setEditing] = useState(false);
  const [addingSubGoal, setAddingSubGoal] = useState(false);
  const [removing, setRemoving] = useState(false);

  const back = (
    <Link
      to="/goals"
      className="mb-4 inline-flex items-center gap-1.5 text-caption font-medium text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('goals:detail.back')}
    </Link>
  );

  if (detail.isPending) {
    return (
      <>
        {back}
        <Skeleton className="mb-6 h-16 max-w-md" />
        <SkeletonList rows={3} />
      </>
    );
  }
  if (detail.isError) {
    const missing = detail.error.status === 404;
    return (
      <>
        {back}
        <ErrorState
          title={missing ? t('goals:detail.notFound') : undefined}
          description={errorMessage(detail.error)}
          onRetry={missing ? undefined : detail.refetch}
        />
      </>
    );
  }

  const { goal, subGoals, habits } = detail.data;
  const deadline = describeDeadline(t, goal);
  const setStatus = (status) =>
    actions.update.mutate({ id: goal.id, patch: { status, baseVersion: goal.version } });
  const open = goal.status === 'active' || goal.status === 'paused';

  return (
    <>
      {back}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <ItemBadge icon={goal.icon} color={goal.color} size="lg" />
          <div className="min-w-0">
            <h1 className="text-title font-semibold text-ink sm:text-display">{goal.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-2">
              <span>{t(`goals:horizon.${goal.horizon}`)}</span>
              <Badge tone={goal.status === 'completed' ? 'success' : 'neutral'}>
                {t(`goals:status.${goal.status}`)}
              </Badge>
              {goal.targetDate && (
                <span>
                  {t('goals:detail.target', { date: format.calendarDate(goal.targetDate) })}
                </span>
              )}
              {deadline && (
                <span className={cn(deadline.overdue && 'font-medium text-danger')}>
                  {deadline.text}
                </span>
              )}
            </p>
            {goal.description && (
              <p className="mt-2 max-w-prose text-body whitespace-pre-wrap text-ink-2">
                {goal.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <Button variant="primary" icon={CircleCheckBig} onClick={() => setStatus('completed')}>
              {t('goals:actions.complete')}
            </Button>
          ) : (
            <Button icon={RotateCcw} onClick={() => setStatus('active')}>
              {t('goals:actions.reopen')}
            </Button>
          )}
          {goal.status === 'active' && (
            <Button icon={Pause} onClick={() => setStatus('paused')}>
              {t('goals:actions.pause')}
            </Button>
          )}
          {goal.status === 'paused' && (
            <Button icon={Play} onClick={() => setStatus('active')}>
              {t('goals:actions.resume')}
            </Button>
          )}
          <Button icon={Pencil} onClick={() => setEditing(true)}>
            {t('goals:actions.edit')}
          </Button>
          <Button variant="danger-ghost" icon={Trash2} onClick={() => setRemoving(true)}>
            {t('goals:actions.delete')}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <ProgressPanel goal={goal} />
        <div className="grid gap-6 lg:grid-cols-2">
          <MilestonesPanel goal={goal} />
          <TasksPanel goal={goal} />
        </div>

        <Panel
          title={t('goals:detail.subGoalsTitle')}
          description={t('goals:detail.subGoalsHint')}
          actions={
            <Button size="sm" icon={Plus} onClick={() => setAddingSubGoal(true)}>
              {t('goals:detail.addSubGoal')}
            </Button>
          }
        >
          {subGoals.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {subGoals.map((subGoal) => (
                <GoalCard key={subGoal.id} goal={subGoal} />
              ))}
            </ul>
          )}
        </Panel>

        {habits.length > 0 && (
          <Panel title={t('goals:detail.habitsTitle')} description={t('goals:detail.habitsHint')}>
            <ul className="flex flex-wrap gap-2">
              {habits.map((habit) => (
                <li key={habit.id}>
                  <Link
                    to={`/habits/${habit.id}`}
                    className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3.5 pl-1 text-body font-medium text-ink hover:bg-surface-3"
                  >
                    <ItemBadge
                      icon={habit.icon}
                      color={habit.color}
                      size="sm"
                      className="rounded-full"
                    />
                    {habit.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <ReviewsPanel goal={goal} />
        <HistoryPanel goalId={goal.id} />
      </div>

      {editing && <GoalFormModal goal={goal} onClose={() => setEditing(false)} />}
      {addingSubGoal && (
        <GoalFormModal
          defaults={{ parentGoalId: goal.id, startDate: goal.startDate }}
          onClose={() => setAddingSubGoal(false)}
        />
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={() =>
          actions.remove.mutate(goal.id, {
            onSuccess: () => navigate('/goals', { replace: true }),
          })
        }
        loading={actions.remove.isPending}
        title={t('goals:delete.title', { title: goal.title })}
        description={t('goals:delete.description')}
        confirmLabel={t('goals:actions.delete')}
      />
    </>
  );
}
