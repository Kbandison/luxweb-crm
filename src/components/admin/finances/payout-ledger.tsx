import { formatUSD } from '@/lib/formatters';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import type { PayoutLedgerRow } from '@/lib/queries/finances';

/**
 * Earned vs. paid, per team member.
 *
 * Earned is derived from what the CRM already knows — logged hours × rate,
 * plus commission on won appointments. Paid comes from bank transactions
 * attributed to that person, so a payout made directly in Mercury counts just
 * the same as one queued here.
 */
export function PayoutLedger({ rows }: { rows: PayoutLedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to settle"
        description="Once hours are logged, commissions are won, or a payment is attributed to someone, the balance shows here."
      />
    );
  }

  const totalOwed = rows.reduce((s, r) => s + Math.max(r.balanceCents, 0), 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              <th className="px-4 py-2.5 font-medium">Person</th>
              <th className="px-4 py-2.5 text-right font-medium">Hours</th>
              <th className="px-4 py-2.5 text-right font-medium">Commission</th>
              <th className="px-4 py-2.5 text-right font-medium">Earned</th>
              <th className="px-4 py-2.5 text-right font-medium">Paid</th>
              <th className="px-4 py-2.5 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamMemberId} className="border-b border-border/60">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.manualOnly ? (
                    <StatusPill
                      label="Fixed rate"
                      tone="bg-surface-2 text-ink-subtle"
                      size="sm"
                      className="ml-2"
                    />
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                  {r.hours > 0 ? r.hours.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                  {r.earnedCommissionCents > 0 ? formatUSD(r.earnedCommissionCents) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                  {r.manualOnly && r.earnedTotalCents === 0
                    ? '—'
                    : formatUSD(r.earnedTotalCents)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                  {formatUSD(r.paidCents)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                    r.balanceCents > 0
                      ? 'text-warning'
                      : r.balanceCents < 0
                        ? 'text-ink-subtle'
                        : 'text-success'
                  }`}
                >
                  {formatUSD(r.balanceCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-sans text-xs text-ink-subtle">
          Attribute an outgoing transaction to someone below and it counts
          against their balance — including payments made straight from Mercury.
          Fixed-rate arrangements can&apos;t be derived from hours, so only
          their paid column is calculated.
        </p>
        {totalOwed > 0 ? (
          <span className="whitespace-nowrap font-mono text-sm tabular-nums text-warning">
            {formatUSD(totalOwed)} outstanding
          </span>
        ) : null}
      </div>
    </div>
  );
}
