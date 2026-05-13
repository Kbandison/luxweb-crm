'use client';
import type { ReactNode } from 'react';

/**
 * Floating action bar shown when one or more rows are selected in an
 * admin list view. The actions slot is rendered inline so callers can mix
 * buttons, links, modals, etc. without this component knowing the details.
 *
 * Layout:
 *   - mobile (<sm): two rows — [count, Clear] on top, actions wrap below.
 *   - sm+:         single row — count · actions · Clear (right-aligned).
 *
 * We use `sm:contents` to flatten the row-wrappers at sm+ so the flex
 * children sit in a single row without extra DOM gymnastics.
 */
export function BulkActionBar({
  count,
  noun = 'selected',
  actions,
  onClear,
}: {
  count: number;
  noun?: string;
  actions: ReactNode;
  onClear: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="region"
      aria-label={`Bulk actions for ${count} ${noun}`}
      className="sticky top-0 z-20 flex flex-col gap-2 border-b border-copper/30 bg-copper-soft/40 px-6 py-2.5 backdrop-blur sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
    >
      <div className="flex items-center justify-between gap-3 sm:contents">
        <span className="font-mono text-[11px] font-medium uppercase tracking-meta text-copper">
          {count} {noun}
        </span>
        <span aria-hidden className="hidden h-3 w-px bg-copper/40 sm:inline-block" />
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[10px] uppercase tracking-meta text-ink-muted hover:text-ink sm:order-last sm:ml-auto"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
