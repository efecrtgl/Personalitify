import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';

const CONTROL =
  'w-full rounded-control border border-line-strong bg-surface text-body text-ink ' +
  'placeholder:text-ink-3 transition-colors duration-150 ' +
  'hover:border-ink-3 focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  'aria-invalid:border-danger aria-invalid:focus:outline-danger';

/**
 * Label, hint and error message around a single control.
 * Children receive the ids they need through a render function so the control is always
 * correctly associated with its label and messages.
 */
export function Field({ label, hint, error, optional, className, children }) {
  const id = useId();
  const { t } = useTranslation();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-caption font-medium text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-3">{t('common:optional')}</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-caption text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn(CONTROL, 'h-10 px-3', className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }) {
  return (
    <textarea rows={rows} className={cn(CONTROL, 'resize-y px-3 py-2', className)} {...props} />
  );
}

/** Password input with a show/hide toggle. */
export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const label = t(visible ? 'common:hidePassword' : 'common:showPassword');
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(CONTROL, 'h-10 pr-11 pl-3', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-control text-ink-3 hover:text-ink"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** Native select: best keyboard, screen reader and mobile behaviour for simple choices. */
export function Select({ options, className, ...props }) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, 'h-10 appearance-none pr-9 pl-3', className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
    </div>
  );
}

/** On/off control with switch semantics. */
export function Switch({ checked, onChange, label, description, disabled, id: providedId }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-body font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-0.5 text-caption text-ink-2">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-standard',
          'disabled:opacity-45',
          checked ? 'bg-success' : 'bg-surface-3',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-raised transition-transform duration-200 ease-standard',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

/**
 * A small set of mutually exclusive options shown side by side.
 * Implemented as a radio group so arrow keys move between options.
 */
export function SegmentedControl({ label, value, onChange, options, className }) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-control bg-surface-2 p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex h-8 cursor-pointer items-center gap-1.5 rounded-[0.4rem] px-3 text-caption font-medium transition-colors duration-150',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
              selected ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
