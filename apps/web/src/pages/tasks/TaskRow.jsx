import {
  CalendarClock,
  Check,
  EllipsisVertical,
  Flag,
  ListChecks,
  Pencil,
  Repeat,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn.js';
import { addDays } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { IconButton } from '../../ui/Button.jsx';
import { Badge } from '../../ui/display.jsx';
import { Menu } from '../../ui/overlays.jsx';

const PRIORITY_COLORS = { high: 'text-danger', medium: 'text-warning', low: 'text-accent' };

/** How a due date reads relative to today: "Today", "Tomorrow", "Yesterday" or the date. */
export function dueLabel(t, format, date, today) {
  if (date === today) return t('tasks:due.today');
  if (date === addDays(today, 1)) return t('tasks:due.tomorrow');
  if (date === addDays(today, -1)) return t('tasks:due.yesterday');
  return format.calendarShortDate(date);
}

/**
 * One task in a list: a completion checkbox, the title (which opens the editor), the facts
 * that matter at a glance, and a menu for the rest.
 */
export function TaskRow({ task, today, categories, actions, onEdit, showDate = true }) {
  const { t } = useTranslation();
  const format = useFormat();
  const category = categories?.get(task.categoryId);
  const done = task.status === 'done';
  const open = task.status === 'todo' || task.status === 'in_progress';
  const overdue = open && task.dueDate && task.dueDate < today;
  const subtasksDone = task.subtasks.filter((subtask) => subtask.done).length;

  const menuItems = [
    { id: 'edit', label: t('tasks:actions.edit'), icon: Pencil, onSelect: () => onEdit(task) },
    open && {
      id: 'tomorrow',
      label: t('tasks:actions.postponeTomorrow'),
      icon: CalendarClock,
      onSelect: () => actions.postpone.mutate({ id: task.id, to: addDays(today, 1) }),
    },
    open && {
      id: 'week',
      label: t('tasks:actions.postponeWeek'),
      icon: CalendarClock,
      onSelect: () => actions.postpone.mutate({ id: task.id, to: addDays(today, 7) }),
    },
    { separator: true },
    {
      id: 'delete',
      label: t('tasks:actions.delete'),
      icon: Trash2,
      tone: 'danger',
      onSelect: () => actions.remove.mutate(task.id),
    },
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t('tasks:actions.markDone', { title: task.title })}
        onClick={() => actions.toggle.mutate(task)}
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 active:scale-90',
          done ? 'border-success bg-success text-white' : 'border-line-strong hover:border-success',
        )}
      >
        <motion.span
          initial={false}
          animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          aria-hidden="true"
        >
          <Check className="size-3.5" strokeWidth={3.5} />
        </motion.span>
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={cn(
            'block max-w-full truncate text-left text-body font-medium text-ink hover:underline',
            (done || task.status === 'cancelled') && 'text-ink-3 line-through',
          )}
        >
          {task.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
          {showDate && task.dueDate && (
            <span className={cn(overdue && 'font-medium text-danger')}>
              {dueLabel(t, format, task.dueDate, today)}
              {task.dueTime && ` · ${task.dueTime}`}
            </span>
          )}
          {!showDate && task.dueTime && <span>{task.dueTime}</span>}
          {task.priority !== 'none' && (
            <span className={cn('inline-flex items-center gap-1', PRIORITY_COLORS[task.priority])}>
              <Flag className="size-3.5" aria-hidden="true" />
              {t(`tasks:priority.${task.priority}`)}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" aria-hidden="true" />
              {t('tasks:row.subtasks', { done: subtasksDone, total: task.subtasks.length })}
            </span>
          )}
          {task.recurrence && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3.5" aria-hidden="true" />
              {t('tasks:row.repeats')}
            </span>
          )}
          {task.postponedCount > 0 && open && (
            <span>{t('tasks:row.postponed', { count: task.postponedCount })}</span>
          )}
          {task.status === 'cancelled' && <Badge>{t('tasks:status.cancelled')}</Badge>}
          {category && <Badge>{category.name}</Badge>}
        </p>
      </div>

      <Menu
        label={t('tasks:actions.more', { title: task.title })}
        trigger={
          <IconButton
            icon={EllipsisVertical}
            size="sm"
            label={t('tasks:actions.more', { title: task.title })}
          />
        }
        items={menuItems}
      />
    </li>
  );
}
