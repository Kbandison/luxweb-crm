'use client';
import { useState } from 'react';

/**
 * The pitch and objection responses, on screen while dialing. Owner-authored
 * in outreach settings. Collapsed by default on the dashboard, pinned open in
 * dial mode.
 */
export function ScriptPanel({
  script,
  objections,
  defaultOpen = false,
}: {
  script: string;
  objections: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!script && !objections) return null;

  return (
    <section className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-subtle">
          Script &amp; objections
        </span>
        <span className="font-mono text-[10px] text-ink-subtle">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border/60 px-4 py-4">
          {script ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-meta text-copper">Pitch</p>
              <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                {script}
              </p>
            </div>
          ) : null}
          {objections ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-meta text-copper">
                Objections
              </p>
              <p className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                {objections}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
