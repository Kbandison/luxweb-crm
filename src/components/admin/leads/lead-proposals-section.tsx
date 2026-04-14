'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProposalRow } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProposalStatusPill } from '@/components/admin/proposals/proposal-status-pill';
import { formatDate, formatUSD } from '@/lib/formatters';

export function LeadProposalsSection({
  contactId,
  proposals,
}: {
  contactId: string;
  proposals: ProposalRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, title: title.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to create proposal.');
        return;
      }
      const { id } = (await res.json()) as { id: string };
      setTitle('');
      setAdding(false);
      router.push(`/admin/proposals/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
          {proposals.length} {proposals.length === 1 ? 'proposal' : 'proposals'}
        </p>
        {!adding ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
              aria-hidden
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New proposal
          </Button>
        ) : null}
      </div>

      {adding ? (
        <form
          onSubmit={create}
          className="space-y-3 rounded-xl border border-copper/30 bg-surface p-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="lead_proposal_title">Title</Label>
            <Input
              id="lead_proposal_title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Signature site build · Proposal v1"
            />
          </div>
          {error ? (
            <p role="alert" className="font-sans text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
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

      {proposals.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-6 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No proposals. Create one above to send to this lead.
          </p>
        </div>
      ) : proposals.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {proposals.map((p, i) => (
            <li
              key={p.id}
              className={i > 0 ? 'border-t border-border' : ''}
            >
              <Link
                href={`/admin/proposals/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {p.title}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">
                    {p.sentAt
                      ? `Sent ${formatDate(p.sentAt)}`
                      : `Created ${formatDate(p.createdAt)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <ProposalStatusPill status={p.status} />
                  {p.totalCents != null ? (
                    <span className="font-mono text-sm tabular-nums text-ink">
                      {formatUSD(p.totalCents)}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
