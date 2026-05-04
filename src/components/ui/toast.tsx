'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const DEFAULT_DURATION_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = ++idRef.current;
      setToasts((curr) => [...curr, { id, tone, title, description }]);
      window.setTimeout(() => remove(id), DEFAULT_DURATION_MS);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push('success', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onClose={remove} />
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API. Throws if used outside <ToastProvider>; that's a
 * loud signal that the layout's missing the provider — easier to catch in
 * dev than a silent no-op.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastViewport({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-end gap-2 px-4 sm:px-6"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  // Mount + animate-in. Detached from auto-dismiss so close-on-click feels
  // immediate.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const accent =
    toast.tone === 'success'
      ? 'border-success/30 bg-success/10'
      : toast.tone === 'error'
        ? 'border-danger/30 bg-danger/10'
        : 'border-copper/30 bg-copper-soft/30';

  const dot =
    toast.tone === 'success'
      ? 'bg-success'
      : toast.tone === 'error'
        ? 'bg-danger'
        : 'bg-copper';

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border bg-surface shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-all duration-200',
        accent,
        visible
          ? 'translate-y-0 opacity-100'
          : '-translate-y-2 opacity-0',
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className={cn('mt-1.5 inline-block h-1.5 w-1.5 rounded-full', dot)}
        />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-sm font-medium text-ink">
            {toast.title}
          </p>
          {toast.description ? (
            <p className="mt-0.5 font-sans text-xs text-ink-muted">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
