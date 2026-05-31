'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Admin control for a project's temporary live/preview link — the staging URL
 * the client views their site at until their real domain is connected.
 * Collapsed it's a small pill (open the link, or "Add preview link"); clicking
 * Edit reveals an inline input. Saving an empty value clears it.
 */
export function ProjectPreviewLink({
  projectId,
  previewUrl,
}: {
  projectId: string;
  previewUrl: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(previewUrl ?? '');
  const [busy, setBusy] = useState(false);

  async function commit(next: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview_url: next }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error("Couldn't save preview link", j.error ?? 'Save failed.');
        return;
      }
      toast.success(next ? 'Preview link saved' : 'Preview link removed');
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={value}
          placeholder="staging.vercel.app or https://…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(value.trim() || null);
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-8 w-64 max-w-full"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => commit(value.trim() || null)}
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(previewUrl ?? '');
            setEditing(false);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        {previewUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => commit(null)}
            disabled={busy}
          >
            Remove
          </Button>
        ) : null}
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-surface px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-copper/40 hover:text-copper"
      >
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
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Preview link
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={previewUrl}
        className="inline-flex items-center gap-1.5 rounded-full border border-copper/40 bg-copper-soft/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-meta text-copper transition-colors hover:bg-copper-soft/70"
      >
        Preview site
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
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle transition-colors hover:text-copper"
      >
        Edit
      </button>
    </span>
  );
}
