'use client';
import { useState } from 'react';
import { formatUSD } from '@/lib/formatters';
import { EmptyState } from '@/components/ui/empty-state';
import type { MonthlyPnL } from '@/lib/queries/finances';

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Cash-basis P&L by month, with the category breakdown behind a row toggle.
 *
 * Invoiced sits beside cash in rather than replacing it: Stripe takes its cut
 * before depositing and pays out in batches, so the two legitimately differ in
 * both amount and timing. Showing one alone would misrepresent the other.
 */
export function PnlTable({ months }: { months: MonthlyPnL[] }) {
  const [open, setOpen] = useState<string | null>(months[0]?.month ?? null);

  if (months.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Once transactions sync, monthly profit and loss appears here."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
            <th className="px-4 py-2.5 font-medium">Month</th>
            <th className="px-4 py-2.5 text-right font-medium">Cash in</th>
            <th className="px-4 py-2.5 text-right font-medium">Expenses</th>
            <th className="px-4 py-2.5 text-right font-medium">Net</th>
            <th className="px-4 py-2.5 text-right font-medium">Invoiced</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const expanded = open === m.month;
            const positive = m.netCents >= 0;
            return (
              <tr key={m.month} className="border-b border-border/60 align-top">
                <td colSpan={5} className="p-0">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : m.month)}
                    aria-expanded={expanded}
                    className="grid w-full grid-cols-5 items-center gap-0 text-left hover:bg-surface-2/50"
                  >
                    <span className="px-4 py-2.5 font-medium text-ink">
                      {expanded ? '▾' : '▸'} {monthLabel(m.month)}
                    </span>
                    <span className="px-4 py-2.5 text-right font-mono tabular-nums text-success">
                      {formatUSD(m.cashInCents)}
                    </span>
                    <span className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                      {formatUSD(m.expensesCents)}
                    </span>
                    <span
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        positive ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {positive ? '+' : '−'}
                      {formatUSD(Math.abs(m.netCents))}
                    </span>
                    <span className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                      {formatUSD(m.invoicedCents)}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="border-t border-border/60 bg-surface-2/40 px-4 py-3">
                      {m.byCategory.length === 0 && m.uncategorizedCount === 0 ? (
                        <p className="font-sans text-xs text-ink-subtle">
                          No categorized spend this month.
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {m.byCategory.map((c) => (
                            <li
                              key={c.category}
                              className="flex items-baseline justify-between gap-4 font-sans text-xs"
                            >
                              <span className="text-ink-muted">{c.category}</span>
                              <span className="font-mono tabular-nums text-ink">
                                {formatUSD(c.cents)}
                              </span>
                            </li>
                          ))}
                          {m.uncategorizedCount > 0 ? (
                            <li className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-1 font-sans text-xs">
                              <span className="text-warning">
                                Uncategorized · {m.uncategorizedCount}
                              </span>
                              <span className="font-mono tabular-nums text-warning">
                                {formatUSD(m.uncategorizedCents)}
                              </span>
                            </li>
                          ) : null}
                        </ul>
                      )}
                      <p className="mt-2 font-sans text-[11px] text-ink-subtle">
                        Transfers between your own Mercury accounts are excluded —
                        moving cash into Taxes or Commission Payouts isn&apos;t
                        spending it.
                      </p>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
