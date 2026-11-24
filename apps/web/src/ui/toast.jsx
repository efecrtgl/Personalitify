import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';

const ToastContext = createContext(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const ICON_COLORS = { success: 'text-success', error: 'text-danger', info: 'text-accent' };
const DURATIONS = { success: 3500, info: 4500, error: 7000 };

/**
 * Transient confirmations and errors. Messages are announced to screen readers through a
 * live region; errors interrupt, everything else waits its turn.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const counter = useRef(0);
  const { t } = useTranslation();

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (tone, message) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATIONS[tone]),
      );
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                role={toast.tone === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-surface p-4 shadow-pop ring-1 ring-line"
              >
                <Icon
                  className={cn('mt-0.5 size-5 shrink-0', ICON_COLORS[toast.tone])}
                  aria-hidden="true"
                />
                <p className="min-w-0 flex-1 text-body text-ink">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label={t('common:dismiss')}
                  className="-m-1 rounded-control p-1 text-ink-3 hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
