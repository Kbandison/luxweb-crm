'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { ProjectStatus } from '@/lib/queries/admin';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_DOT,
  PROJECT_STATUS_LABEL,
} from './status-meta';

/**
 * Admin-side editable project status pill. Renders the same look as the
 * static badge but opens a small dropdown on click so admin can change
 * status without leaving the page.
 *
 * The dropdown is portaled to <body> + positioned via fixed coordinates
 * computed from the button's bounding rect, so it escapes the project
 * header's `overflow-hidden` containing block.
 */
export function ProjectStatusEditor({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ProjectStatus | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    function reposition() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, left: r.left });
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  async function save(next: ProjectStatus) {
    if (next === status) {
      setOpen(false);
      return;
    }
    setBusy(next);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("Couldn't update status", j.error ?? 'Update failed.');
        return;
      }
      toast.success('Status updated', PROJECT_STATUS_LABEL[next]);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const menu =
    open && pos ? (
      <div
        ref={menuRef}
        role="listbox"
        style={{ top: pos.top, left: pos.left }}
        className="fixed z-[60] w-44 overflow-hidden rounded-md border border-border bg-surface shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
      >
        {PROJECT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={s === status}
            onClick={() => save(s)}
            disabled={busy != null}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left font-sans text-xs transition-colors',
              s === status
                ? 'bg-copper-soft/50 text-ink'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              busy != null && 'opacity-50',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                PROJECT_STATUS_DOT[s],
              )}
              aria-hidden
            />
            <span className="flex-1">{PROJECT_STATUS_LABEL[s]}</span>
            {busy === s ? (
              <span className="font-mono text-[10px] text-ink-subtle">…</span>
            ) : null}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors',
          'hover:border-copper/40 hover:text-ink',
          open && 'border-copper/40 text-ink',
        )}
        title="Click to change status"
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            PROJECT_STATUS_DOT[status],
          )}
          aria-hidden
        />
        {PROJECT_STATUS_LABEL[status]}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-2.5 w-2.5"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}
