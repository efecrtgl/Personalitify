import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';

/** The Personalitify mark. Decorative next to the wordmark; labelled when shown alone. */
export function BrandMark({ className, title }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('size-8 shrink-0', className)}
    >
      <rect width="64" height="64" rx="15" className="fill-accent" />
      <path
        d="M23 47V18h11.500c6.400 0 10.500 3.900 10.500 9.600s-4.100 9.600-10.500 9.600H29"
        fill="none"
        strokeWidth="5.500"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-accent"
      />
      <circle cx="23" cy="47" r="3.200" className="fill-on-accent" />
    </svg>
  );
}

export function Brand({ className }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark />
      <span className="text-heading font-semibold tracking-tight text-ink">
        {t('common:app.name')}
      </span>
    </span>
  );
}
