'use client';
import type { ReactNode } from 'react';

/**
 * Floating action bar shown when one or more rows are selected in an
 * admin list view. The actions slot is rendered inline so callers can mix
 * buttons, links, modals, etc. without this component knowing the details.
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
      className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-copper/30 bg-copper-soft/40 px-6 py-2.5 backdrop-blur"
    >
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-copper">
        {count} {noun}
      </span>
      <span aria-hidden className="h-3 w-px bg-copper/40" />
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
      <button
        type="button"
        onClick={onClear}
        className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
      >
        Clear
      </button>
    </div>
  );
}
