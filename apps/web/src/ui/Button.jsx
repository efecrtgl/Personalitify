import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn.js';

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-hover',
  'danger-ghost': 'text-danger hover:bg-danger-soft active:bg-danger-soft',
};

const SIZES = {
  sm: 'h-8 gap-1.5 px-3 text-caption',
  md: 'h-10 gap-2 px-4 text-body',
  lg: 'h-12 gap-2 px-5 text-body',
};

const ICON_SIZES = { sm: 'size-8', md: 'size-10', lg: 'size-12' };

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-control font-medium ' +
  'transition-colors duration-150 ease-standard select-none ' +
  'disabled:opacity-45 disabled:pointer-events-none';

/** Class names of a button, for elements that look like one but are not a <button>. */
export function buttonClassName({ variant = 'secondary', size = 'md', fullWidth = false } = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full');
}

/**
 * The single button of the design system.
 * `loading` keeps the width, disables interaction and announces a busy state.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="size-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

/** A square button that shows only an icon. `label` is required for assistive technology. */
export function IconButton({
  icon: Icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], ICON_SIZES[size], className)}
      {...props}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-5'} aria-hidden="true" />
    </button>
  );
}
