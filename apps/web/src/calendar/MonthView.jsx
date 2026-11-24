import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { weekdayOf } from '../lib/dates.js';
import { CalendarItem, dropTargetProps } from './CalendarItem.jsx';
import { itemsTouching, monthWeeks } from './layout.js';

const VISIBLE_PER_DAY = 3;

/**
 * A month as a grid of days. Each day shows its first few items and how many more there
 * are; choosing the day number opens that day.
 */
export function MonthView({
  date,
  today,
  weekStart,
  items,
  conflictIds,
  format,
  onSelectItem,
  onOpenDay,
  onCreate,
  onMove,
}) {
  const { t } = useTranslation();
  const weeks = monthWeeks(date, weekStart);
  const month = date.slice(0, 7);
  const byId = new Map(items.map((item) => [item.id, item]));

  return (
    <div
      role="grid"
      aria-label={format.calendarMonth(date)}
      className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-line"
    >
      <div role="row" className="grid grid-cols-7 border-b border-line">
        {weeks[0].map((day) => (
          <div
            key={day}
            role="columnheader"
            aria-label={format.weekdayName(weekdayOf(day), 'long')}
            className="px-2 py-2 text-center text-caption font-medium text-ink-2"
          >
            <span aria-hidden="true">{format.weekdayName(weekdayOf(day), 'short')}</span>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div
          key={week[0]}
          role="row"
          className="grid grid-cols-7 border-b border-line last:border-b-0"
        >
          {week.map((day) => {
            const dayItems = itemsTouching(items, day);
            const visible = dayItems.slice(0, VISIBLE_PER_DAY);
            const hidden = dayItems.length - visible.length;
            const outside = !day.startsWith(month);
            return (
              <div
                key={day}
                role="gridcell"
                onClick={() => onCreate({ date: day })}
                {...dropTargetProps((id) => onMove(byId.get(id), { date: day }))}
                className={cn(
                  'flex min-h-24 min-w-0 cursor-pointer flex-col gap-1 border-r border-line p-1.5 last:border-r-0 sm:min-h-28',
                  outside && 'bg-surface-2/50',
                )}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDay(day);
                  }}
                  aria-label={format.calendarWeekdayDate(day)}
                  aria-current={day === today ? 'date' : undefined}
                  className={cn(
                    'flex size-7 items-center justify-center self-start rounded-full text-caption font-medium tabular-nums hover:bg-surface-3',
                    outside ? 'text-ink-3' : 'text-ink',
                    day === today && 'bg-accent text-on-accent hover:bg-accent-hover',
                  )}
                >
                  {Number(day.slice(8))}
                </button>
                {visible.map((item) => (
                  <CalendarItem
                    key={item.id}
                    item={item}
                    timeLabel={item.allDay ? null : format.wallTime(item.startTime)}
                    conflict={conflictIds.has(item.id)}
                    onSelect={onSelectItem}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDay(day);
                    }}
                    className="self-start rounded px-1 text-caption text-ink-2 hover:text-ink hover:underline"
                  >
                    {t('calendar:more', { count: hidden })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
