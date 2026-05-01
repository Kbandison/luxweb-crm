'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-ink print:hidden"
    >
      Print
    </button>
  );
}
