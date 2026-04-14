'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Milestone } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABEL,
  MILESTONE_STATUS_TONE,
  type MilestoneStatus,
} from './status-meta';
import { formatDate } from '@/lib/formatters';

export function MilestonesList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Milestone[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Milestone | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isClientVisible, setIsClientVisible] = useState(true);

  function reset() {
    setTitle('');
    setDescription('');
    setDueDate('');
    setIsClientVisible(true);
    setError(null);
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          is_client_visible: isClientVisible,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to add milestone.');
        return;
      }
      reset();
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setPendingId(id);
    await fetch(`/api/admin/milestones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setPendingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!confirming) return;
    setConfirmBusy(true);
    setPendingId(confirming.id);
    try {
      await fetch(`/api/admin/milestones/${confirming.id}`, { method: 'DELETE' });
    } finally {
      setConfirmBusy(false);
      setPendingId(null);
      setConfirming(null);
      router.refresh();
    }
  }

  const total = initial.length;
  const done = initial.filter((m) => m.status === 'done').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium tracking-tight text-ink">
            Milestones
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {done}/{total} done
          </p>
        </div>
        {!adding ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New milestone
          </Button>
        ) : null}
      </div>

      {/* Composer */}
      {adding ? (
        <form
          onSubmit={create}
          className="overflow-hidden rounded-xl border border-copper/30 bg-surface"
        >
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="m_title">Title</Label>
              <Input
                id="m_title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Discovery sign-off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m_description">Description</Label>
              <textarea
                id="m_description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context for the team or client."
                className="block w-full rounded-md border border-border bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m_due">Due date</Label>
                <Input
                  id="m_due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-muted">
                <input
                  type="checkbox"
                  checked={isClientVisible}
                  onChange={(e) => setIsClientVisible(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-copper"
                />
                Client visible
              </label>
            </div>
            {error ? (
              <p role="alert" className="font-sans text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setAdding(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !title.trim()}>
              {busy ? 'Saving…' : 'Add milestone'}
            </Button>
          </div>
        </form>
      ) : null}

      {/* List */}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No milestones. Add the first one above.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {initial.map((m, i) => (
            <li
              key={m.id}
              className={cn(
                'group relative overflow-hidden rounded-xl border border-border bg-surface p-4 transition-colors',
                m.status === 'done' && 'opacity-70',
                pendingId === m.id && 'opacity-50',
              )}
            >
              <div className="flex items-start gap-4">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-[11px] tabular-nums text-ink-subtle">
                  {(i + 1).toString().padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h4
                      className={cn(
                        'font-sans text-sm font-medium text-ink',
                        m.status === 'done' && 'line-through decoration-ink-subtle',
                      )}
                    >
                      {m.title}
                    </h4>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                        MILESTONE_STATUS_TONE[m.status],
                      )}
                    >
                      {MILESTONE_STATUS_LABEL[m.status]}
                    </span>
                  </div>
                  {m.description ? (
                    <p className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-muted">
                      {m.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                    {m.dueDate ? (
                      <span>Due {formatDate(m.dueDate)}</span>
                    ) : (
                      <span>No due date</span>
                    )}
                    <span aria-hidden>·</span>
                    <span
                      className={
                        m.isClientVisible ? 'text-success' : 'text-copper'
                      }
                    >
                      {m.isClientVisible ? '◐ Client visible' : '🔒 Internal'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    aria-label="Status"
                    value={m.status}
                    onChange={(e) =>
                      patch(m.id, { status: e.target.value as MilestoneStatus })
                    }
                    disabled={pendingId === m.id}
                    className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted focus:border-copper focus:outline-none focus:ring-2 focus:ring-copper/30"
                  >
                    {MILESTONE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {MILESTONE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      patch(m.id, { is_client_visible: !m.isClientVisible })
                    }
                    disabled={pendingId === m.id}
                    title={
                      m.isClientVisible
                        ? 'Hide from client portal'
                        : 'Reveal in client portal'
                    }
                    className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink disabled:opacity-50"
                  >
                    {m.isClientVisible ? 'Hide' : 'Reveal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(m)}
                    disabled={pendingId === m.id}
                    className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        open={confirming !== null}
        tone="danger"
        title="Delete milestone"
        description={
          confirming ? (
            <>
              Remove <span className="font-mono text-ink">{confirming.title}</span> from
              this project? The audit log will still retain the record.
            </>
          ) : null
        }
        confirmLabel="Delete milestone"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirming(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
