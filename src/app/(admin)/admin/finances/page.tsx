import { EmptyState } from '@/components/ui/empty-state';
import { SectionHead } from '@/components/ui/section-head';
import { StatCard } from '@/components/ui/stat-card';
import {
  getBankAccounts,
  getCashSummary,
  getMonthlyPnL,
  FINANCE_WINDOW_MONTHS,
} from '@/lib/queries/finances';
import { mercuryConfigured } from '@/lib/mercury/client';
import { formatUSD, formatDateTime } from '@/lib/formatters';
import { PnlTable } from '@/components/admin/finances/pnl-table';

/**
 * The glance: where the money is and how the months are trending.
 *
 * Transactions, reconciliation, and team payouts each own a route now, so this
 * page pays for only the three queries it renders — and the cash summary and
 * P&L share one cached transaction window between them.
 *
 * Chrome, the capability gate, and the sync buttons live in layout.tsx.
 */
export default async function FinancesOverviewPage() {
  if (!mercuryConfigured()) {
    return (
      <EmptyState
        title="Mercury isn't connected"
        description="Add a read-only MERCURY_API_TOKEN in your environment, redeploy, then sync. Read-only is deliberate — the CRM reports on your banking, it never moves money."
      />
    );
  }

  const [accounts, summary, pnl] = await Promise.all([
    getBankAccounts(),
    getCashSummary(),
    getMonthlyPnL(FINANCE_WINDOW_MONTHS),
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Available"
          value={formatUSD(summary.totalAvailableCents)}
          hint="Across active accounts"
          size="md"
        />
        <StatCard
          label="Current balance"
          value={formatUSD(summary.totalCurrentCents)}
          hint={summary.pendingCount > 0 ? `${summary.pendingCount} pending` : 'Nothing pending'}
          size="md"
        />
        <StatCard
          label="In this month"
          value={formatUSD(summary.monthInCents)}
          tone="success"
          hint="Settled deposits"
          size="md"
        />
        <StatCard
          label="Out this month"
          value={formatUSD(summary.monthOutCents)}
          tone={summary.monthNetCents < 0 ? 'danger' : 'default'}
          hint={`Net ${summary.monthNetCents >= 0 ? '+' : '−'}${formatUSD(
            Math.abs(summary.monthNetCents),
          )}`}
          size="md"
        />
      </section>

      {accounts.length > 0 ? (
        <section className="space-y-3">
          <SectionHead
            number="01"
            title="Accounts"
            size="md"
            right={
              summary.lastSyncedAt ? (
                <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  Synced {formatDateTime(summary.lastSyncedAt)}
                </span>
              ) : undefined
            }
          />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 text-right font-medium">Available</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-ink">{a.nickname || a.name}</span>
                      {a.last4 ? (
                        <span className="ml-2 font-mono text-xs text-ink-subtle">
                          ····{a.last4}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                      {formatUSD(a.availableCents)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                      {formatUSD(a.currentCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHead
          number={accounts.length > 0 ? '02' : '01'}
          title="Profit & loss"
          description="Cash basis, by month. Expand a month for the category breakdown."
          size="md"
        />
        <PnlTable months={pnl} />
      </section>
    </div>
  );
}
