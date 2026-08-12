'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatUSD, formatDate } from '@/lib/formatters';
import type { DepositToReconcile } from '@/lib/queries/finances';

/**
 * Match deposits to the invoices they paid.
 *
 * Suggestions are proposals, never decisions. When several invoices share an
 * amount — which happens constantly with recurring work — more than one match
 * is arithmetically valid and only a human knows which is right.
 */
export function ReconcilePanel({ deposits }: { deposits: DepositToReconcile[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function match(transactionId: string, invoiceIds: string[]) {
    setBusy(transactionId);
    try {
      const res = await fetch('/api/admin/finances/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, invoice_ids: invoiceIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't match", body.error ?? 'Try again.');
        return;
      }
      toast.success(`Matched ${body.matched} invoice${body.matched === 1 ? '' : 's'}`);
      router.refresh();
    } catch {
      toast.error("Couldn't match", 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  async function unmatch(transactionId: string) {
    setBusy(transactionId);
    try {
      const res = await fetch(
        `/api/admin/finances/reconcile?transaction_id=${encodeURIComponent(transactionId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Couldn't unmatch", body.error ?? 'Try again.');
        return;
      }
      toast.success('Match removed');
      router.refresh();
    } catch {
      toast.error("Couldn't unmatch", 'Network error.');
    } finally {
      setBusy(null);
    }
  }

  if (deposits.length === 0) {
    return (
      <EmptyState
        title="No deposits to reconcile"
        description="Incoming money appears here once it settles."
      />
    );
  }

  const open = deposits.filter((d) => d.matched.length === 0);
  const done = deposits.filter((d) => d.matched.length > 0);

  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <p className="font-sans text-xs text-success">
          Every settled deposit is accounted for.
        </p>
      ) : null}

      <ul className="space-y-3">
        {[...open, ...done].map((d) => (
          <li key={d.transactionId} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="font-mono text-lg tabular-nums text-success">
                  +{formatUSD(d.amountCents)}
                </span>
                <span className="ml-2 font-sans text-sm text-ink">
                  {d.counterpartyName ?? 'Unknown'}
                </span>
                <span className="ml-2 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  {d.postedAt ? formatDate(d.postedAt) : '—'}
                </span>
              </div>
              {d.matched.length > 0 ? (
                <div className="flex items-center gap-2">
                  <StatusPill label="Matched" tone="bg-success/15 text-success" size="sm" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy === d.transactionId}
                    onClick={() => void unmatch(d.transactionId)}
                  >
                    Unmatch
                  </Button>
                </div>
              ) : (
                <StatusPill label="Unmatched" tone="bg-warning/15 text-warning" size="sm" />
              )}
            </div>

            {d.matched.length > 0 ? (
              <p className="mt-2 font-sans text-xs text-ink-muted">
                {d.matched.length} invoice{d.matched.length === 1 ? '' : 's'} ·{' '}
                {formatUSD(d.matchedGrossCents)} gross
                {d.matchedGrossCents > d.amountCents ? (
                  <>
                    {' · '}
                    <span className="text-ink-subtle">
                      {formatUSD(d.matchedGrossCents - d.amountCents)} in fees
                    </span>
                  </>
                ) : null}
              </p>
            ) : d.suggestions.length === 0 ? (
              <p className="mt-2 font-sans text-xs text-ink-subtle">
                No invoice combination explains this deposit — it may not be
                client revenue.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {d.suggestions.map((s) => (
                  <li
                    key={s.invoiceIds.join('-')}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2"
                  >
                    <span className="font-sans text-xs text-ink">
                      {s.invoiceIds.length} invoice{s.invoiceIds.length === 1 ? '' : 's'} ·{' '}
                      {formatUSD(s.grossCents)} gross
                    </span>
                    {s.impliedFeeCents > 0 ? (
                      <span className="font-sans text-xs text-ink-subtle">
                        − {formatUSD(s.impliedFeeCents)} fees
                      </span>
                    ) : (
                      <StatusPill label="Exact" tone="bg-success/15 text-success" size="sm" />
                    )}
                    <StatusPill
                      label={s.confidence}
                      tone={
                        s.confidence === 'high'
                          ? 'bg-copper-soft text-copper'
                          : 'bg-surface-2 text-ink-subtle'
                      }
                      size="sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy === d.transactionId}
                      onClick={() => void match(d.transactionId, s.invoiceIds)}
                      className="ml-auto"
                    >
                      Match
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
