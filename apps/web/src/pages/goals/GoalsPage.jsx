import { CalendarDays, ListChecks, Milestone, Plus, Target } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '../../hooks/useAccount.js';
import { cn } from '../../lib/cn.js';
import { Button } from '../../ui/Button.jsx';
import { Badge, Card, PageHeader } from '../../ui/display.jsx';
import { EmptyState, ErrorState, SkeletonList } from '../../ui/feedback.jsx';
import { SegmentedControl } from '../../ui/fields.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { useHabitDay } from '../habits/useHabits.js';
import { GoalFormModal } from './GoalFormModal.jsx';
import { GoalProgressBar, describeDeadline } from './GoalProgress.jsx';
import { useGoalList } from './useGoals.js';

const STATUS_TONES = { paused: 'neutral', completed: 'success', abandoned: 'neutral' };

/** A goal as a card: what it is, how far along it is and when it is due. */
export function GoalCard({ goal }) {
  const { t } = useTranslation();
  const deadline = describeDeadline(t, goal);
  const { milestones, tasks } = goal.computed;
  return (
    <Card as="li" className="transition-shadow duration-200 hover:shadow-raised">
      <Link to={`/goals/${goal.id}`} className="flex h-full flex-col gap-4 rounded-card p-5">
        <div className="flex items-start gap-3">
          <ItemBadge icon={goal.icon} color={goal.color} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-body font-semibold text-ink">{goal.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
              <span>{t(`goals:horizon.${goal.horizon}`)}</span>
              {STATUS_TONES[goal.status] && (
                <Badge tone={STATUS_TONES[goal.status]}>{t(`goals:status.${goal.status}`)}</Badge>
              )}
            </p>
          </div>
        </div>
        <GoalProgressBar goal={goal} />
        <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-2">
          {deadline && (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                deadline.overdue && 'font-medium text-danger',
              )}
            >
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {deadline.text}
            </span>
          )}
          {milestones.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <Milestone className="size-3.5" aria-hidden="true" />
              {t('goals:card.milestones', milestones)}
            </span>
          )}
          {tasks.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" aria-hidden="true" />
              {t('goals:card.tasks', tasks)}
            </span>
          )}
        </p>
      </Link>
    </Card>
  );
}

export function GoalsPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState('open');
  const [creating, setCreating] = useState(false);
  const goals = useGoalList({ status, parentGoalId: 'none' });
  // Today, in the user's time zone, is the default start date of a new goal.
  const today = useHabitDay().data?.today;

  return (
    <>
      <PageHeader
        title={t('goals:title')}
        description={t('goals:description')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {t('goals:actions.new')}
          </Button>
        }
      />
      <SegmentedControl
        label={t('goals:filter.label')}
        value={status}
        onChange={setStatus}
        options={['open', 'completed', 'all'].map((value) => ({
          value,
          label: t(`goals:filter.${value}`),
        }))}
        className="mb-5"
      />

      {goals.isPending ? (
        <SkeletonList rows={3} />
      ) : goals.isError ? (
        <ErrorState description={errorMessage(goals.error)} onRetry={goals.refetch} />
      ) : goals.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={t(status === 'completed' ? 'goals:empty.completedTitle' : 'goals:empty.title')}
            description={t(
              status === 'completed'
                ? 'goals:empty.completedDescription'
                : 'goals:empty.description',
            )}
            action={
              status !== 'completed' && (
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  {t('goals:actions.new')}
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {goals.data.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      )}

      {creating && (
        <GoalFormModal defaults={{ startDate: today }} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
