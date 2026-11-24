import { Check, Repeat, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';

/** Color of an item when it has none of its own. */
const KIND_COLORS = { event: '#0a84ff', task: '#5e5ce6', habit: '#30d158' };

export const DRAG_TYPE = 'application/x-personalitify-calendar-item';

const DONE_STATES = new Set(['done', 'completed']);

/**
 * One entry of the calendar, drawn as a compact chip (month view, all-day area) or as a
 * block (time grid). It is a button: activating it opens whatever it stands for.
 *
 * Events and tasks can be dragged to another day or time. Dragging is a pointer shortcut;
 * the same change is always possible by opening the item and editing its date.
 */
export function CalendarItem({
  item,
  variant = 'chip',
  timeLabel,
  conflict = false,
  onSelect,
  className,
  style,
}) {
  const { t } = useTranslation();
  const color = item.color ?? KIND_COLORS[item.kind];
  const done = DONE_STATES.has(item.status);
  const draggable = item.kind !== 'habit';
  const description = [
    t(`calendar:kinds.${item.kind}`),
    timeLabel,
    conflict ? t('calendar:conflict.label') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
      title={`${item.title} — ${description}`}
      aria-label={`${item.title}, ${description}`}
      style={{
        backgroundColor: `${color}${item.kind === 'event' ? '2e' : '1f'}`,
        borderColor: color,
        ...style,
      }}
      className={cn(
        'flex min-w-0 items-start gap-1 overflow-hidden rounded-[0.4rem] border-l-[3px] px-1.5 text-left text-caption leading-tight text-ink transition-[filter] duration-150 hover:brightness-95',
        variant === 'chip' ? 'h-6 items-center' : 'flex-col py-1',
        done && 'opacity-60',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-1">
        {done && <Check className="size-3 shrink-0" aria-hidden="true" />}
        {conflict && <TriangleAlert className="size-3 shrink-0 text-warning" aria-hidden="true" />}
        <span className={cn('min-w-0 flex-1 truncate font-medium', done && 'line-through')}>
          {item.title}
        </span>
        {item.recurring && item.kind === 'event' && (
          <Repeat className="size-3 shrink-0 text-ink-3" aria-hidden="true" />
        )}
      </span>
      {variant === 'block' && timeLabel && (
        <span className="truncate text-[0.6875rem] text-ink-2">{timeLabel}</span>
      )}
    </button>
  );
}

/** Reads the id of a dragged calendar item from a drop event, or null. */
export function draggedItemId(event) {
  return event.dataTransfer.getData(DRAG_TYPE) || null;
}

/** Marks an element as a drop target for calendar items. */
export function dropTargetProps(onDropItem) {
  return {
    onDragOver: (event) => {
      if ([...event.dataTransfer.types].includes(DRAG_TYPE)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }
    },
    onDrop: (event) => {
      const id = draggedItemId(event);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      onDropItem(id, event);
    },
  };
}
