'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProposalRow } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProposalStatusPill } from './proposal-status-pill';
import { formatDate, formatUSD } from '@/lib/formatters';

export function ProposalsList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProposalRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ProposalRow | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, title: title.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to create proposal.');
        return;
      }
      const { id } = (await res.json()) as { id: string };
      setTitle('');
      setAdding(false);
      router.push(`/admin/projects/${projectId}/proposals/${id}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirming) return;
    setConfirmBusy(true);
    try {
      await fetch(`/api/admin/proposals/${confirming.id}`, { method: 'DELETE' });
    } finally {
      setConfirmBusy(false);
      setConfirming(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium tracking-tight text-ink">
            Proposals
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {initial.length} total ·{' '}
            {initial.filter((p) => p.status === 'draft').length} draft
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
            New proposal
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
              <Label htmlFor="proposal_title">Title</Label>
              <Input
                id="proposal_title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Signature site build · Proposal v1"
              />
              <p className="font-sans text-xs text-ink-subtle">
                You can edit everything in the next step.
              </p>
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
                setAdding(false);
                setTitle('');
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !title.trim()}>
              {busy ? 'Creating…' : 'Create draft'}
            </Button>
          </div>
        </form>
      ) : null}

      {/* List */}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No proposals. Draft one with the button above — you&apos;ll edit
            every section in the next step.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="w-44 px-5 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {initial.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/projects/${projectId}/proposals/${p.id}`}
                      className="font-sans text-sm font-medium text-ink hover:text-copper"
                    >
                      {p.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
                      Created {formatDate(p.createdAt)}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <ProposalStatusPill status={p.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                    {p.totalCents != null
                      ? formatUSD(p.totalCents)
                      : '—'}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                    {formatDate(p.sentAt)}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/admin/projects/${projectId}/proposals/${p.id}`}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                      >
                        {p.status === 'draft' ? 'Edit' : 'Open'}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setConfirming(p)}
                        className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        tone="danger"
        title="Delete proposal"
        description={
          confirming ? (
            <>
              Remove{' '}
              <span className="font-mono text-ink">{confirming.title}</span>{' '}
              from this project? The audit log still retains the record.
            </>
          ) : null
        }
        confirmLabel="Delete proposal"
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? undefined : setConfirming(null))}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
