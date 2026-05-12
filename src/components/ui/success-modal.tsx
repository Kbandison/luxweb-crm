'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/**
 * Full-attention "you did the thing" modal — reserved for milestone
 * moments where the celebration matters (proposal accepted, agreement
 * signed). Routine confirmations should use the toast system instead.
 */
export function SuccessModal({
  open,
  title,
  description,
  primaryLabel = 'Continue',
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose?: () => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onClose={() => onClose?.()}
      labelledBy={titleId}
      className="z-[70]"
      panelClassName="w-full max-w-md"
    >
      <div className="relative isolate overflow-hidden rounded-2xl border border-success/30 bg-surface p-7 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-success/25 via-success/10 to-transparent blur-2xl"
        />

        <div className="relative">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/30"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h2
            id={titleId}
            className="mt-5 font-display text-2xl font-medium tracking-tight text-ink"
          >
            {title}
          </h2>
          {description ? (
            <div className="mt-3 font-sans text-sm leading-relaxed text-ink-muted">
              {description}
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-end gap-2">
            {secondaryLabel ? (
              <Button
                variant="ghost"
                onClick={onSecondary ?? onClose}
              >
                {secondaryLabel}
              </Button>
            ) : null}
            <Button onClick={onPrimary ?? onClose}>{primaryLabel}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
