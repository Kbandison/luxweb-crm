import { cn } from '@/lib/utils';

/**
 * Shared status pill primitive. Use this anywhere we render a small
 * status badge (invoices, proposals, milestones, revisions, projects).
 *
 * Standard look (md, no dot): mono-uppercase 10px on a tinted background.
 * Pass `tone` from the matching TONE map (e.g. INVOICE_STATUS_TONE[status]).
 *
 * `withDot` adds a 1.5px colored dot before the label — useful for the
 * project-status pill where the dot carries semantic color and the
 * background is neutral so the dot reads as the signal. The dot's color
 * comes from `dotClass` (e.g. PROJECT_STATUS_DOT[status]).
 */
export type StatusPillProps = {
  label: string;
  tone: string;
  size?: 'sm' | 'md';
  withDot?: boolean;
  dotClass?: string;
  className?: string;
};

export function StatusPill({
  label,
  tone,
  size = 'md',
  withDot = false,
  dotClass,
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded font-mono font-medium uppercase tracking-meta-tight',
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]',
        withDot && 'gap-1.5',
        tone,
        className,
      )}
    >
      {withDot ? (
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 rounded-full', dotClass)}
        />
      ) : null}
      {label}
    </span>
  );
}
