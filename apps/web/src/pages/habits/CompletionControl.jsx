import { Check, Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn.js';

const SIZE = 44;
const STROKE = 3.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The control that completes a habit for the day.
 *
 * - Check habits: one round button that fills with the habit's color.
 * - Count and duration habits: the same ring showing progress, with step buttons.
 *
 * The ring and the check mark animate when progress changes; with reduced motion the
 * change is instant.
 */
export function CompletionControl({ item, disabled, onChange }) {
  const { t } = useTranslation();
  const { habit, state, value, target, progress } = item;
  const completed = state === 'completed';
  const { kind } = habit.target;
  const step = kind === 'duration' ? 5 : 1;

  const ring = (
    <span className="relative flex size-11 items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-surface-3"
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill={completed ? habit.color : 'none'}
          stroke={habit.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={false}
          animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - progress) }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        />
      </svg>
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-white"
        initial={false}
        animate={{ scale: completed ? 1 : 0.4, opacity: completed ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        aria-hidden="true"
      >
        <Check className="size-5" strokeWidth={3} />
      </motion.span>
    </span>
  );

  if (kind === 'check') {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={t('habits:actions.markDone', { name: habit.name })}
        disabled={disabled}
        onClick={() => onChange(completed ? null : { value: target })}
        className="shrink-0 rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-45"
      >
        {ring}
      </button>
    );
  }

  const stepButton =
    'flex size-8 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={t('habits:actions.decrease', { name: habit.name })}
        disabled={disabled || value <= 0}
        onClick={() => onChange({ increment: -step })}
        className={stepButton}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={completed}
        aria-label={t('habits:actions.markDone', { name: habit.name })}
        disabled={disabled}
        onClick={() => onChange(completed ? { value: 0 } : { value: target })}
        className={cn(
          'rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-45',
        )}
      >
        {ring}
      </button>
      <button
        type="button"
        aria-label={t('habits:actions.increase', { name: habit.name })}
        disabled={disabled}
        onClick={() => onChange({ increment: step })}
        className={stepButton}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
