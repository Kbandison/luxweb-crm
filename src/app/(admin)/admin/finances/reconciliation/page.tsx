import { getDepositsToReconcile } from '@/lib/queries/finances';
import { ReconcilePanel } from '@/components/admin/finances/reconcile-panel';

/**
 * Deposits ↔ invoices.
 *
 * Its own route because the matcher is the most expensive thing in the
 * section — a bounded subset search per unmatched deposit — and there's no
 * reason to run it when someone just wants a balance.
 */
export default async function FinancesReconciliationPage() {
  const deposits = await getDepositsToReconcile();

  return (
    <section className="space-y-3">
      <p className="font-sans text-sm text-ink-muted">
        Match deposits to the invoices they paid. Stripe batches its payouts, so
        one deposit often covers several.
      </p>
      <ReconcilePanel deposits={deposits} />
    </section>
  );
}
