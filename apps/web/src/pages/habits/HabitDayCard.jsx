import {
  CalendarClock,
  EllipsisVertical,
  Flame,
  Pencil,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '../../lib/cn.js';
import { addDays } from '../../lib/dates.js';
import { useFormat } from '../../lib/format.js';
import { IconButton } from '../../ui/Button.jsx';
import { Badge, Card } from '../../ui/display.jsx';
import { Menu } from '../../ui/overlays.jsx';
import { ItemBadge } from '../../ui/pickers.jsx';
import { CompletionControl } from './CompletionControl.jsx';
import { describeProgress, describeSchedule, describeStreak } from './habitText.js';

const STATE_TONES = { skipped: 'neutral', postponed: 'neutral', missed: 'danger' };

/** One habit on one day: what it is, how far along it is, and the controls to record it. */
export function HabitDayCard({ item, today, onChange, onEdit }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { habit, state, period, streak } = item;
  // The server accepts today and, as a time zone tolerance, tomorrow.
  const locked = item.date > addDays(today, 1);
  const excused = state === 'skipped' || state === 'postponed';
  const progressText = describeProgress(t, format, habit.target, item.value);

  const menuItems = [
    !excused && {
      id: 'skip',
      label: t('habits:actions.skip'),
      icon: SkipForward,
      onSelect: () => onChange({ status: 'skipped' }),
    },
    !excused &&
      item.due && {
        id: 'postpone',
        label: t('habits:actions.postpone'),
        icon: CalendarClock,
        onSelect: () => onChange({ status: 'postponed', postponedTo: addDays(item.date, 1) }),
      },
    item.entry && {
      id: 'reset',
      label: t('habits:actions.reset'),
      icon: RotateCcw,
      onSelect: () => onChange(null),
    },
    { separator: true },
    { id: 'edit', label: t('habits:actions.edit'), icon: Pencil, onSelect: () => onEdit(habit) },
  ].filter(Boolean);

  return (
    <Card
      as="li"
      className={cn('flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4', excused && 'opacity-70')}
    >
      <ItemBadge icon={habit.icon} color={habit.color} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/habits/${habit.id}`}
          className={cn(
            'block truncate text-body font-semibold text-ink hover:underline',
            state === 'completed' && 'text-ink-2 line-through decoration-ink-3',
          )}
        >
          {habit.name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-2">
          {period ? (
            <span>
              {t(`habits:period.${habit.schedule.period}`, {
                completed: period.completed,
                target: period.target,
              })}
            </span>
          ) : (
            <span>{describeSchedule(t, format, habit.schedule)}</span>
          )}
          {progressText && <span className="font-medium text-ink">{progressText}</span>}
          {streak.current > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <Flame className="size-3.5" aria-hidden="true" />
              {describeStreak(t, streak)}
            </span>
          )}
          {STATE_TONES[state] && (
            <Badge tone={STATE_TONES[state]}>{t(`habits:states.${state}`)}</Badge>
          )}
        </p>
      </div>
      {!excused && <CompletionControl item={item} disabled={locked} onChange={onChange} />}
      <Menu
        label={t('habits:actions.more', { name: habit.name })}
        trigger={
          <IconButton
            icon={EllipsisVertical}
            size="sm"
            label={t('habits:actions.more', { name: habit.name })}
          />
        }
        items={menuItems}
      />
    </Card>
  );
}
