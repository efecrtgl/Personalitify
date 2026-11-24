import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { Button } from './Button.jsx';

export function Spinner({ className, label }) {
  const { t } = useTranslation();
  return (
    <span role="status" className="inline-flex items-center justify-center">
      <LoaderCircle
        className={cn('size-5 animate-spin text-ink-3', className)}
        aria-hidden="true"
      />
      <span className="sr-only">{label ?? t('common:loading')}</span>
    </span>
  );
}

/** Placeholder with the shape of the content that is loading. */
export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('skeleton h-4', className)} />;
}

/** A stack of skeleton rows for list-like content. */
export function SkeletonList({ rows = 3, className }) {
  const { t } = useTranslation();
  return (
    <div role="status" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{t('common:loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 rounded-card" />
      ))}
    </div>
  );
}

/** Shown when a view has no content yet. Always says what the user can do next. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-heading font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Shown when loading a view failed. Offers a retry when one is possible. */
export function ErrorState({ title, description, onRetry, className }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </div>
      <h3 className="text-heading font-semibold text-ink">{title ?? t('common:errorTitle')}</h3>
      <p className="mt-1 max-w-sm text-body text-ink-2">
        {description ?? t('common:errorDescription')}
      </p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          {t('common:retry')}
        </Button>
      )}
    </div>
  );
}

const TONES = {
  info: { icon: Info, className: 'bg-accent-soft text-ink', iconClassName: 'text-accent' },
  success: {
    icon: CircleCheck,
    className: 'bg-success-soft text-ink',
    iconClassName: 'text-success',
  },
  warning: {
    icon: CircleAlert,
    className: 'bg-warning-soft text-ink',
    iconClassName: 'text-warning',
  },
  danger: { icon: CircleAlert, className: 'bg-danger-soft text-ink', iconClassName: 'text-danger' },
};

/** Inline message that belongs to the surrounding content (as opposed to a toast). */
export function Banner({ tone = 'info', title, children, action, className }) {
  const { icon: Icon, className: toneClassName, iconClassName } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-start gap-x-3 gap-y-3 rounded-card p-4',
        toneClassName,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconClassName)} aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-body text-ink-2">{children}</div>}
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
