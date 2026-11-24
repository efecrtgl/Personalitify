import { X } from 'lucide-react';
import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { Button, IconButton } from './Button.jsx';

/**
 * Modal dialog built on the native <dialog> element, which provides the focus trap, the
 * Escape key, the inert background and the correct accessibility role.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The browser focuses the first focusable element, which is the close button. A dialog
      // that asks for input should start in its first field instead.
      dialog.querySelector('input:not([type="hidden"]), textarea, select')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100vw-2rem)] rounded-sheet bg-surface p-0 text-ink shadow-pop ring-1 ring-line',
        'backdrop:bg-overlay backdrop:backdrop-blur-[2px]',
        'open:animate-[pfy-dialog-in_180ms_var(--ease-standard)]',
        size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[min(85dvh,44rem)] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-heading font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-body text-ink-2">
                  {description}
                </p>
              )}
            </div>
            <IconButton
              icon={X}
              label={t('common:close')}
              size="sm"
              onClick={onClose}
              className="-mt-1 -mr-2"
            />
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Asks for confirmation before an action that is destructive or hard to undo. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading = false,
  children,
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common:cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t('common:confirm')}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/**
 * Dropdown menu. `trigger` is a button element; `items` are
 * `{ id, label, icon, onSelect, tone, selected }` or `{ separator: true }`.
 * Follows the menu button pattern: arrow keys move, Enter/Space activate, Escape closes.
 */
export function Menu({ trigger, items, align = 'end', label }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    listRef.current?.querySelector('[role^="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  const onKeyDown = (event) => {
    const entries = [...(listRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])];
    const index = entries.indexOf(document.activeElement);
    const focusAt = (next) => entries[(next + entries.length) % entries.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(entries.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      {cloneElement(trigger, {
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpen((value) => !value),
      })}
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            'absolute top-full z-40 mt-2 min-w-52 rounded-card bg-surface p-1.5 shadow-pop ring-1 ring-line',
            'animate-[pfy-pop-in_140ms_var(--ease-standard)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) =>
            item.separator ? (
              <div key={`separator-${index}`} role="separator" className="my-1.5 h-px bg-line" />
            ) : (
              <button
                key={item.id}
                type="button"
                role={item.selected === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.selected}
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-[0.5rem] px-2.5 text-left text-body',
                  'hover:bg-surface-2 focus:bg-surface-2 focus:outline-none',
                  item.tone === 'danger' ? 'text-danger' : 'text-ink',
                  item.selected && 'font-medium',
                )}
              >
                {item.icon && <item.icon className="size-4 shrink-0" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.selected && (
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Short explanatory text shown on hover and keyboard focus. */
// `align`: where the bubble sits against its trigger, `center` or `end`.
export function Tooltip({ content, children, side = 'top', align = 'center' }) {
  const id = useId();
  return (
    <span className="group/tooltip relative inline-flex">
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-56 rounded-[0.5rem] bg-ink px-2.5 py-1.5 text-left text-caption font-normal text-canvas shadow-raised',
          // `end` keeps the bubble inside the page when its trigger sits at the right edge.
          align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2',
          'opacity-0 transition-opacity duration-150 group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
