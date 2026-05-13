'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Which edge to pin to. Default 'right'. */
  side?: 'right' | 'left';
  /** Panel width preset. sm=420px, md=520px, lg=720px. Default 'md'. */
  width?: 'sm' | 'md' | 'lg';
  labelledBy?: string;
  describedBy?: string;
  /** Default true. Set false for forms mid-submit. */
  closeOnBackdropClick?: boolean;
  /** Default true. */
  closeOnEscape?: boolean;
  /** Additional class for the overlay (rarely needed). */
  className?: string;
  /** Additional class for the panel wrapper (rarely needed — width preset handles sizing). */
  panelClassName?: string;
  children: React.ReactNode;
};

const WIDTH_CLASS: Record<NonNullable<DrawerProps['width']>, string> = {
  sm: 'w-full max-w-[420px]',
  md: 'w-full max-w-[520px]',
  lg: 'w-full max-w-[720px]',
};

/**
 * Slide-in side drawer. Built on top of <Dialog> so it inherits the same
 * focus trap, autofocus, escape, scroll lock, click-outside, and restore-
 * focus behavior. Drawer only changes the *positioning* of the panel —
 * pinned full-height to the right or left edge with a transform-based
 * slide-in animation.
 *
 * The slide animation runs on mount (we render only when `open` is true,
 * so the panel transitions from translate-x-full → translate-x-0 on its
 * first paint). Closing is immediate — Dialog unmounts on `open=false`.
 */
export function Drawer({
  open,
  onClose,
  side = 'right',
  width = 'md',
  labelledBy,
  describedBy,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className,
  panelClassName,
  children,
}: DrawerProps) {
  // Track post-mount frame so we can transition the panel from off-screen
  // to its resting position. Without this, the panel would appear instantly.
  const [entered, setEntered] = React.useState(false);
  React.useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    // Two RAFs — the first commits the off-screen transform, the second
    // schedules the entered transform so the browser has a starting frame
    // to animate from.
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setEntered(true));
      // Best-effort cleanup of nested rAF id.
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id1);
  }, [open]);

  const sideAttachClass = side === 'right' ? 'justify-end' : 'justify-start';
  const offscreenTransform =
    side === 'right' ? 'translate-x-full' : '-translate-x-full';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={labelledBy}
      describedBy={describedBy}
      closeOnBackdropClick={closeOnBackdropClick}
      closeOnEscape={closeOnEscape}
      // Override Dialog's centered overlay: drawer pins to one side, no
      // padding, lighter scrim w/ blur to match the previous hand-rolled
      // look. twMerge keeps these wins over Dialog's defaults.
      className={cn(
        'items-stretch p-0 bg-ink/30 backdrop-blur-sm',
        sideAttachClass,
        className,
      )}
      panelClassName={cn(
        'flex h-full flex-col border-border bg-surface shadow-2xl transition-transform duration-300 ease-out',
        side === 'right' ? 'border-l' : 'border-r',
        WIDTH_CLASS[width],
        entered ? 'translate-x-0' : offscreenTransform,
        panelClassName,
      )}
    >
      {children}
    </Dialog>
  );
}
