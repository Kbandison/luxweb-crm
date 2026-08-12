import { redirect } from 'next/navigation';
import { SectionHead } from '@/components/ui/section-head';
import { getSession } from '@/lib/supabase/session';
import { hasCapability } from '@/lib/auth/permissions';
import {
  getBankAccounts,
  getPayoutLedger,
  getPaymentRequests,
} from '@/lib/queries/finances';
import { paymentsEnabled } from '@/lib/mercury/payments';
import { PayoutLedger } from '@/components/admin/finances/payout-ledger';
import { PayoutPanel } from '@/components/admin/finances/payout-panel';

/** What the team is owed, and (when enabled) queueing what they're paid. */
export default async function FinancesTeamPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Queueing money needs more than read access to the books — an accountant
  // sees balances, they don't send payouts.
  const canPay = paymentsEnabled() && hasCapability(session.role, 'manage_billing');

  const [ledger, accounts, payouts] = await Promise.all([
    getPayoutLedger(),
    canPay ? getBankAccounts() : Promise.resolve([]),
    canPay ? getPaymentRequests() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHead
          number="01"
          title="Owed to the team"
          description="Earned from logged hours and won commissions, against what's actually been paid."
          size="md"
        />
        <PayoutLedger rows={ledger} />
      </section>

      {canPay ? (
        <section className="space-y-3">
          <SectionHead
            number="02"
            title="Payouts"
            description="Queue a payment; approve it in Mercury to actually send it."
            size="md"
          />
          <PayoutPanel accounts={accounts} requests={payouts} />
        </section>
      ) : null}
    </div>
  );
}
