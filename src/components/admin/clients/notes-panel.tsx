'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NoteRow } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/formatters';

export function NotesPanel({
  contactId,
  notes: initial,
}: {
  contactId: string;
  notes: NoteRow[];
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<NoteRow | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'contact',
          entity_id: contactId,
          body: body.trim(),
          is_private: isPrivate,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to add note.');
        return;
      }
      setBody('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePrivate(note: NoteRow) {
    setPendingId(note.id);
    await fetch(`/api/admin/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_private: !note.isPrivate }),
    });
    setPendingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!confirming) return;
    setConfirmBusy(true);
    setPendingId(confirming.id);
    try {
      await fetch(`/api/admin/notes/${confirming.id}`, { method: 'DELETE' });
    } finally {
      setConfirmBusy(false);
      setPendingId(null);
      setConfirming(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Composer */}
      <form
        onSubmit={create}
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Add a note about this client…"
          className="block w-full resize-none border-0 bg-transparent px-4 py-3 font-sans text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-0"
          maxLength={8000}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-3 py-2">
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-copper"
            />
            Private (admin only)
          </label>
          {error ? (
            <p role="alert" className="font-sans text-xs text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={busy || !body.trim()}
            className="ml-auto"
          >
            {busy ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      </form>

      {/* List */}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No notes. Anything you write here is admin-only by default.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {initial.map((note) => (
            <li
              key={note.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                      note.isPrivate
                        ? 'bg-copper-soft/60 text-copper'
                        : 'bg-success/10 text-success',
                    )}
                  >
                    {note.isPrivate ? '🔒 Private' : '◐ Client visible'}
                  </span>
                  <span className="font-mono text-[11px] text-ink-subtle">
                    {note.authorEmail ?? 'system'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <time
                    className="font-mono text-[11px] tabular-nums text-ink-subtle"
                    dateTime={note.createdAt}
                  >
                    {formatRelative(note.createdAt)}
                  </time>
                  <button
                    type="button"
                    onClick={() => togglePrivate(note)}
                    disabled={pendingId === note.id}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-copper disabled:opacity-50"
                  >
                    {note.isPrivate ? 'Reveal' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(note)}
                    disabled={pendingId === note.id}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-ink">
                {note.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        tone="danger"
        title="Delete note"
        description={
          <>
            This note will be removed permanently. The audit log still retains
            a record of the deletion.
          </>
        }
        confirmLabel="Delete note"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirming(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

