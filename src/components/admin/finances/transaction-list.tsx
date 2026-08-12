'use client';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { formatUSD, formatDate } from '@/lib/formatters';
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
                        {t.category ? (
                          <StatusPill label={t.category} tone="bg-copper-soft text-copper" size="sm" />
                        ) : t.mercuryCategory ? (
                          <span className="font-sans text-xs text-ink-muted">
                            {t.mercuryCategory}
                          </span>
                        ) : (
                          <span className="font-sans text-xs text-ink-subtle">—</span>
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
