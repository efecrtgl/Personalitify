import { ITEM_COLORS, ITEM_ICONS } from '@personalitify/shared-contracts';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { itemIcon } from '../lib/icons.js';

/** Names of the palette colors, for assistive technology. */
export const COLOR_KEYS = {
  '#0a84ff': 'blue',
  '#5e5ce6': 'indigo',
  '#bf5af2': 'purple',
  '#ff375f': 'pink',
  '#ff453a': 'red',
  '#ff9f0a': 'orange',
  '#ffd60a': 'yellow',
  '#30d158': 'green',
  '#40c8e0': 'teal',
  '#8e8e93': 'gray',
};

/** Chooses one color of the shared palette. A radio group with visible swatches. */
export function ColorPicker({ label, value, onChange, colors = ITEM_COLORS }) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-caption font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const selected = value?.toLowerCase() === color;
          const colorName = t(`common:colors.${COLOR_KEYS[color]}`);
          return (
            <label
              key={color}
              title={colorName}
              style={{ backgroundColor: color }}
              className={cn(
                'flex size-7 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                'has-focus-visible:ring-2 has-focus-visible:ring-accent',
                selected && 'ring-2 ring-ink-3',
              )}
            >
              <input
                type="radio"
                name={name}
                value={color}
                checked={selected}
                onChange={() => onChange(color)}
                className="sr-only"
                aria-label={colorName}
              />
              {selected && <Check className="size-4 text-white" aria-hidden="true" />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Chooses one icon of the shared icon set. */
export function IconPicker({ label, value, onChange, color }) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-caption font-medium text-ink">{label}</legend>
      <div className="grid max-h-40 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto rounded-control bg-surface-2 p-1.5">
        {ITEM_ICONS.map((icon) => {
          const Icon = itemIcon(icon);
          const selected = value === icon;
          const iconName = t(`common:icons.${icon}`);
          return (
            <label
              key={icon}
              title={iconName}
              style={selected ? { color } : undefined}
              className={cn(
                'flex size-9 cursor-pointer items-center justify-center rounded-[0.5rem] transition-colors',
                'has-focus-visible:outline-2 has-focus-visible:outline-accent',
                selected
                  ? 'bg-surface shadow-card'
                  : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={name}
                value={icon}
                checked={selected}
                onChange={() => onChange(icon)}
                className="sr-only"
                aria-label={iconName}
              />
              <Icon className="size-5" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A colored tile with an item's icon, used wherever a habit, category or goal is shown. */
export function ItemBadge({ icon, color, size = 'md', className }) {
  const Icon = itemIcon(icon);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `${color}26`, color }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control',
        size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  );
}

/**
 * Toggle chips for choosing several values (weekdays, days of the month).
 * A group of checkboxes, so each chip is individually reachable and announced.
 */
export function ChipToggleGroup({ label, options, values, onChange, className }) {
  const toggle = (value) =>
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-2 text-caption font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <label
              key={option.value}
              title={option.title}
              className={cn(
                'flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-full px-2.5 text-caption font-medium transition-colors select-none',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                selected
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(option.value)}
                className="sr-only"
                aria-label={option.title ?? option.label}
              />
              <span aria-hidden="true">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
