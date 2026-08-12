import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { buttonVariants } from '@/components/ui/button';
import { SectionHead } from '@/components/ui/section-head';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import {
  getBankAccounts,
  getBankTransactions,
  getCashSummary,
  getMonthlyPnL,
  getPaymentRequests,
  getDepositsToReconcile,
  getPayoutLedger,
  getPayableMembers,
  FINANCE_WINDOW_MONTHS,
} from '@/lib/queries/finances';
import { mercuryConfigured } from '@/lib/mercury/client';
import { formatUSD, formatDateTime } from '@/lib/formatters';
import { MercurySyncButton } from '@/components/admin/finances/sync-button';
import { TransactionList } from '@/components/admin/finances/transaction-list';
import { PnlTable } from '@/components/admin/finances/pnl-table';
import { PayoutPanel } from '@/components/admin/finances/payout-panel';
import { ReconcilePanel } from '@/components/admin/finances/reconcile-panel';
import { PayoutLedger } from '@/components/admin/finances/payout-ledger';
import { paymentsEnabled } from '@/lib/mercury/payments';

export default async function AdminFinancesPage() {
  const session = await getSession();
  // Banking is financial data — same gate as earnings.
  if (!session || !hasCapability(session.role, 'view_finance')) {
    redirect('/admin/dashboard');
  }

  const connected = mercuryConfigured();
  // Payouts stay invisible unless deliberately switched on, and are limited to
  // roles that can act on money — an accountant reads the books, they don't
  // queue payments.
  const canPay = paymentsEnabled() && hasCapability(session.role, 'manage_billing');

  const [accounts, summary, transactions, pnl, payouts, deposits, ledger, members] =
    await Promise.all([
    getBankAccounts(),
    getCashSummary(),
    getBankTransactions({ limit: 250 }),
    getMonthlyPnL(FINANCE_WINDOW_MONTHS),
    canPay ? getPaymentRequests() : Promise.resolve([]),
    getDepositsToReconcile(),
    getPayoutLedger(),
    getPayableMembers(),
  ]);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl space-y-12 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Money"
          title="Finances"
          description="Cash actually in the bank. Invoiced revenue lives in Earnings."
          actions={
            connected ? (
              <>
                <Link
                  href="/admin/earnings"
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Earnings
                </Link>
                <MercurySyncButton days={365} />
                <MercurySyncButton />
              </>
            ) : undefined
          }
        />

        {!connected ? (
          <EmptyState
            title="Mercury isn't connected"
            description="Add a read-only MERCURY_API_TOKEN in your environment, redeploy, then sync. Read-only is deliberate — the CRM reports on your banking, it never moves money."
          />
        ) : (
          <>
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
                hint={
                  summary.pendingCount > 0
                    ? `${summary.pendingCount} pending`
                    : 'Nothing pending'
                }
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
                            <span className="font-medium text-ink">
                              {a.nickname || a.name}
                            </span>
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

            <section className="space-y-3">
              <SectionHead
                number={accounts.length > 0 ? '03' : '02'}
                title="Reconciliation"
                description="Match deposits to the invoices they paid. Stripe batches its payouts, so one deposit often covers several."
                size="md"
              />
              <ReconcilePanel deposits={deposits} />
            </section>

            <section className="space-y-3">
              <SectionHead
                number={accounts.length > 0 ? '04' : '03'}
                title="Transactions"
                description="Set a category on outgoing money to feed the P&L."
                size="md"
              />
              <TransactionList transactions={transactions} members={members} />
            </section>

            <section className="space-y-3">
              <SectionHead
                number={accounts.length > 0 ? '05' : '04'}
                title="Owed to the team"
                description="Earned from logged hours and won commissions, against what's actually been paid."
                size="md"
              />
              <PayoutLedger rows={ledger} />
            </section>

            {canPay ? (
              <section className="space-y-3">
                <SectionHead
                  number={accounts.length > 0 ? '06' : '05'}
                  title="Payouts"
                  description="Queue a payment; approve it in Mercury to actually send it."
                  size="md"
                />
                <PayoutPanel accounts={accounts} requests={payouts} />
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
