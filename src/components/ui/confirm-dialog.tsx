'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) void onConfirm();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Focus the primary action so Enter works and screen readers announce it.
    confirmBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, busy, onCancel, onConfirm]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={!busy ? onCancel : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_32px_80px_-20px_rgba(0,0,0,0.4)]"
      >
        {/* Top accent — soft danger wash for destructive actions */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full blur-2xl',
            isDanger
              ? 'bg-gradient-to-br from-danger/20 via-danger/5 to-transparent'
              : 'bg-gradient-to-br from-copper/18 via-gold/8 to-transparent',
          )}
        />

        <div className="relative px-6 pb-5 pt-6">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1',
                isDanger
                  ? 'bg-danger/10 text-danger ring-danger/20'
                  : 'bg-copper-soft/60 text-copper ring-copper/20',
              )}
            >
              {isDanger ? <IconAlert /> : <IconQuestion />}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="confirm-dialog-title"
                className="font-display text-lg font-medium tracking-tight text-ink"
              >
                {title}
              </h2>
              {description ? (
                <div className="mt-2 font-sans text-sm leading-relaxed text-ink-muted">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function IconAlert() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconQuestion() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
