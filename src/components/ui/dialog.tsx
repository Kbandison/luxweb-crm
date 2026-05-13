'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Selector matching every focusable element we want the focus trap to
 * cycle through. Mirrors the canonical list used by ARIA helpers.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  /** Default true. Set false for forms mid-submit. */
  closeOnBackdropClick?: boolean;
  /** Default true. */
  closeOnEscape?: boolean;
  /** Outer overlay class — useful for tuning z-index per surface. */
  className?: string;
  /** Inner panel wrapper class. */
  panelClassName?: string;
  children: React.ReactNode;
};

/**
 * Modal Dialog primitive with focus trap, autofocus, escape-to-close,
 * backdrop-click-to-close, and body scroll lock. Restores focus to the
 * previously focused element on close.
 *
 * The trap walks the modal's DOM each Tab — small enough that we don't
 * cache a focusable list (cheap, and always correct as the form changes).
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className,
  panelClassName,
  children,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  // Mirror the latest handler + closeOnEscape in refs so the autofocus +
  // keydown effect can read them WITHOUT subscribing as dependencies.
  // Without this, every parent re-render (e.g. keystroke into an input)
  // produces a new inline onClose closure, the effect re-runs, and
  // autofocus snaps back to the panel's first focusable — usually the
  // close button — yanking focus away on every keystroke.
  const onCloseRef = React.useRef(onClose);
  const closeOnEscapeRef = React.useRef(closeOnEscape);
  React.useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  });

  React.useEffect(() => {
    if (!open) return;

    // Remember the trigger so we can return focus on close.
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Lock body scroll. We re-store the prior value so nested dialogs
    // don't reset to "" and let the page scroll while a parent is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Autofocus first focusable inside the panel. setTimeout 0 so the
    // browser commits the DOM before we query for elements.
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) {
        first.focus();
      } else {
        // Nothing focusable — focus the panel itself so screen readers
        // still announce the dialog.
        panel.focus();
      }
    }, 0);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeOnEscapeRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('data-focus-trap-exempt'));
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus if the previous trigger is still in the DOM.
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4',
        className,
      )}
      onMouseDown={(e) => {
        // Backdrop click: only fire when the mouse-down originated on the
        // overlay itself, not on the panel. Prevents drag-out-of-input
        // selections from accidentally closing the modal.
        if (!closeOnBackdropClick) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('outline-none', panelClassName)}
      >
        {children}
      </div>
    </div>
  );
}
