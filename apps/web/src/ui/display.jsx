import { cn } from '../lib/cn.js';

/** A surface that groups related content. */
export function Card({ as: Component = 'section', className, children, ...props }) {
  return (
    <Component
      className={cn('rounded-card bg-surface shadow-card ring-1 ring-line', className)}
      {...props}
    >
      {children}
    </Component>
  );
}

/** Card with a heading row and consistently padded body. */
export function Panel({ title, description, actions, children, className, bodyClassName }) {
  return (
    <Card className={className}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-heading font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-body text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('px-5 pt-4 pb-5 sm:px-6 sm:pb-6', bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Title block at the top of a page. */
export function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-title font-semibold text-ink sm:text-display">{title}</h1>
        {description && <p className="mt-1 text-body text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts.at(-1)[0] : '';
  return (first + last).toLocaleUpperCase();
}

/** Picks black or white text for readable contrast on an arbitrary background color. */
function readableTextColor(hex) {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex.slice(1) : '0a84ff';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1d1d1f' : '#ffffff';
}

const AVATAR_SIZES = {
  sm: 'size-8 text-caption',
  md: 'size-10 text-body',
  lg: 'size-16 text-title',
};

export function Avatar({ name, color, size = 'md', className }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        AVATAR_SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

const BADGE_TONES = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-caption font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A row in a settings-like list: label and description on the left, control on the right. */
export function Row({ title, description, children, className }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0',
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-body font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-caption text-ink-2">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
