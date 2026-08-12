'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatUSD, formatDate } from '@/lib/formatters';
import { EXPENSE_CATEGORIES, isInternalTransfer } from '@/lib/finances/categories';
import type { BankTransactionRow } from '@/lib/queries/finances';

type Flow = 'all' | 'in' | 'out' | 'pending';

const FLOWS: Array<{ key: Flow; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Money out' },
  { key: 'pending', label: 'Pending' },
];

function isPending(t: BankTransactionRow): boolean {
  return t.status === 'pending' || !t.postedAt;
}

export function TransactionList({ transactions }: { transactions: BankTransactionRow[] }) {
  const [flow, setFlow] = useState<Flow>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (flow === 'in' && t.amountCents < 0) return false;
      if (flow === 'out' && t.amountCents >= 0) return false;
      if (flow === 'pending' && !isPending(t)) return false;
      if (!q) return true;
      return [t.counterpartyName, t.description, t.category, t.mercuryCategory]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, flow, search]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        description="Run a sync to pull your Mercury history into the CRM."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FLOWS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFlow(f.key)}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-meta transition-colors ${
              flow === f.key
                ? 'bg-copper text-surface'
                : 'bg-surface-2 text-ink-muted hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name or memo…"
          className="h-8 w-auto flex-1 sm:max-w-[240px]"
          aria-label="Filter transactions"
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Counterparty</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const pending = isPending(t);
                const incoming = t.amountCents >= 0;
                const internal = isInternalTransfer(t.kind);
                return (
                  <tr key={t.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink-subtle">
                      {formatDate(t.postedAt ?? t.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">
                        {t.counterpartyName ?? 'Unknown'}
                      </span>
                      {t.description ? (
                        <span className="block font-sans text-xs text-ink-subtle">
                          {t.description}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {internal ? (
                          <StatusPill
                            label="Internal"
                            tone="bg-surface-2 text-ink-subtle"
                            size="sm"
                          />
                        ) : incoming ? (
                          <span className="font-sans text-xs text-ink-subtle">—</span>
                        ) : (
                          <CategoryPicker id={t.id} value={t.category} hint={t.mercuryCategory} />
                        )}
                        {pending ? (
                          <StatusPill label="Pending" tone="bg-warning/15 text-warning" size="sm" />
                        ) : null}
                      </div>
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums ${
                        incoming ? 'text-success' : 'text-ink'
                      }`}
                    >
                      {incoming ? '+' : '−'}
                      {formatUSD(Math.abs(t.amountCents))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Set a studio expense category on one transaction.
 *
 * Only offered on outgoing, non-internal money — an internal transfer isn't
 * spending and a deposit isn't an expense, so neither belongs in the P&L
 * breakdown. Writes only to CRM-owned columns, which the Mercury sync never
 * overwrites.
 */
function CategoryPicker({
  id,
  value,
  hint,
}: {
  id: string;
  value: string | null;
  hint: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function set(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/finances/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: next || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Couldn't categorize", body.error ?? 'Try again.');
        return;
      }
      router.refresh();
    } catch {
      toast.error("Couldn't categorize", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={value ?? ''}
      disabled={busy}
      onChange={(e) => void set(e.target.value)}
      aria-label="Expense category"
      className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-ink focus-visible:border-copper focus-visible:outline-none disabled:opacity-50"
    >
      <option value="">{hint ? `Uncategorized · ${hint}` : 'Uncategorized'}</option>
      {EXPENSE_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
