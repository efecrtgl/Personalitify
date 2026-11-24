import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { weekdayOf } from '../lib/dates.js';
import { CalendarItem, dropTargetProps } from './CalendarItem.jsx';
import { MINUTES_PER_DAY, itemsOfDay, layoutTimed, snapMinutes, toTime } from './layout.js';

const HOUR_HEIGHT = 48;
const DAY_HEIGHT = 24 * HOUR_HEIGHT;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** The minute of the day a pointer event points at inside a day column. */
function minuteAt(event, column) {
  const { top } = column.getBoundingClientRect();
  return snapMinutes(((event.clientY - top) / DAY_HEIGHT) * MINUTES_PER_DAY);
}

/**
 * One or several days as columns with a vertical time axis: an all-day area on top and the
 * hours below. Used for both the day view (one date) and the week view (seven).
 */
export function TimeGridView({
  dates,
  today,
  items,
  conflictIds,
  format,
  onSelectItem,
  onOpenDay,
  onCreate,
  onMove,
}) {
  const { t } = useTranslation();
  const scroller = useRef(null);
  const byId = new Map(items.map((item) => [item.id, item]));
  const columns = `3.25rem repeat(${dates.length}, minmax(0, 1fr))`;

  // Start at the morning instead of midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
        <div />
        {dates.map((day) => (
          <div key={day} className="min-w-0 border-l border-line px-1 py-2 text-center">
            <button
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={format.calendarWeekdayDate(day)}
              aria-current={day === today ? 'date' : undefined}
              className="inline-flex flex-col items-center gap-0.5 rounded-control px-2 py-0.5 hover:bg-surface-2"
            >
              <span className="text-caption text-ink-2" aria-hidden="true">
                {format.weekdayName(weekdayOf(day), 'short')}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-body font-semibold tabular-nums',
                  day === today ? 'bg-accent text-on-accent' : 'text-ink',
                )}
              >
                {Number(day.slice(8))}
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="grid border-b border-line" style={{ gridTemplateColumns: columns }}>
        <div className="px-1 py-1.5 text-right text-[0.6875rem] text-ink-3">
          {t('calendar:allDay')}
        </div>
        {dates.map((day) => (
          <div
            key={day}
            onClick={() => onCreate({ date: day, allDay: true })}
            {...dropTargetProps((id) => onMove(byId.get(id), { date: day }))}
            className="flex min-h-8 min-w-0 cursor-pointer flex-col gap-1 border-l border-line p-1"
          >
            {itemsOfDay(items, day).allDay.map((item) => (
              <CalendarItem
                key={item.id}
                item={item}
                conflict={conflictIds.has(item.id)}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        ))}
      </div>

      <div ref={scroller} className="max-h-[34rem] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns, height: DAY_HEIGHT }}>
          <div className="relative" aria-hidden="true">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                style={{ top: hour * HOUR_HEIGHT }}
                className="absolute right-1.5 -translate-y-1/2 text-[0.6875rem] text-ink-3 tabular-nums"
              >
                {format.wallTime(toTime(hour * 60))}
              </span>
            ))}
          </div>
          {dates.map((day) => {
            const placed = layoutTimed(itemsOfDay(items, day).timed, day);
            return (
              <div
                key={day}
                data-date={day}
                onClick={(event) =>
                  onCreate({ date: day, startTime: toTime(minuteAt(event, event.currentTarget)) })
                }
                {...dropTargetProps((id, event) =>
                  onMove(byId.get(id), {
                    date: day,
                    startTime: toTime(minuteAt(event, event.currentTarget)),
                  }),
                )}
                className="relative cursor-pointer border-l border-line"
                style={{
                  backgroundImage:
                    'linear-gradient(to bottom, var(--pfy-line) 1px, transparent 1px)',
                  backgroundSize: `100% ${HOUR_HEIGHT}px`,
                }}
              >
                {placed.map(({ item, start, end, column, columns: count }) => (
                  <CalendarItem
                    key={item.id}
                    item={item}
                    variant="block"
                    timeLabel={`${format.wallTime(item.startTime)} – ${format.wallTime(item.endTime)}`}
                    conflict={conflictIds.has(item.id)}
                    onSelect={onSelectItem}
                    className="absolute"
                    style={{
                      top: (start / 60) * HOUR_HEIGHT + 1,
                      height: ((end - start) / 60) * HOUR_HEIGHT - 2,
                      left: `calc(${(column / count) * 100}% + 2px)`,
                      width: `calc(${100 / count}% - 4px)`,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
