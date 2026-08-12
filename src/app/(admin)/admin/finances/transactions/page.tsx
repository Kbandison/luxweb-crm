import { getBankTransactions, getPayableMembers } from '@/lib/queries/finances';
import { TransactionList } from '@/components/admin/finances/transaction-list';

/** The feed — categorize spend and attribute payouts. */
export default async function FinancesTransactionsPage() {
  const [transactions, members] = await Promise.all([
    getBankTransactions({ limit: 250 }),
    getPayableMembers(),
  ]);

  return (
    <section className="space-y-3">
      <p className="font-sans text-sm text-ink-muted">
        Set a category on outgoing money to feed the P&amp;L, and attribute a
        payment to someone to count it against what they&apos;re owed.
      </p>
      <TransactionList transactions={transactions} members={members} />
    </section>
  );
}
