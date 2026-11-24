import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn.js';
import { useFormat } from '../../lib/format.js';

/** A goal's progress as a labelled bar in the goal's color. */
export function GoalProgressBar({ goal, className }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { percent } = goal.computed;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('goals:progress.label', { title: goal.title })}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-standard"
          style={{ width: `${percent}%`, backgroundColor: goal.color }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-caption font-medium text-ink tabular-nums">
        {t('goals:progress.percent', { value: format.number(Math.round(percent)) })}
      </span>
    </div>
  );
}

/** "12 days left", "Due today", "5 days overdue" — or nothing without a target date. */
export function describeDeadline(t, goal) {
  const { daysLeft } = goal.computed;
  if (daysLeft === null || goal.status === 'completed' || goal.status === 'abandoned') return null;
  if (daysLeft === 0) return { text: t('goals:deadline.today'), overdue: false };
  if (daysLeft > 0) return { text: t('goals:deadline.left', { count: daysLeft }), overdue: false };
  return { text: t('goals:deadline.overdue', { count: -daysLeft }), overdue: true };
}
