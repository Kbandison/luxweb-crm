'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer } from '@/components/ui/drawer';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatUSD, formatDate } from '@/lib/formatters';
import type { BankAccountRow, PaymentRequestRow } from '@/lib/queries/finances';

type Recipient = {
  id: string;
  name: string;
  defaultPaymentMethod: string | null;
  lastPaid: string | null;
};

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-surface-2 text-ink-subtle',
  submitted: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-danger/10 text-danger',
  cancelled: 'bg-surface-2 text-ink-subtle',
  failed: 'bg-danger/10 text-danger',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Not sent',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/**
 * Queue a payout for approval in Mercury.
 *
 * The CRM never moves money — this creates a request that a human approves in
 * Mercury's dashboard. Recipients are read live rather than mirrored, because
 * they carry account and routing numbers we have no reason to store.
 */
export function PayoutPanel({
  accounts,
  requests,
}: {
  accounts: BankAccountRow[];
  requests: PaymentRequestRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open || recipients !== null) return;
    let active = true;
    fetch('/api/admin/finances/recipients')
      .then((r) => (r.ok ? r.json() : { recipients: [] }))
      .then((d) => {
        if (active) setRecipients((d.recipients ?? []) as Recipient[]);
      })
      .catch(() => {
        if (active) setRecipients([]);
      });
    return () => {
      active = false;
    };
  }, [open, recipients]);

  const amountCents = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100);
  const valid = accountId && recipientId && Number.isFinite(amountCents) && amountCents > 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const recipient = recipients?.find((r) => r.id === recipientId);
      const res = await fetch('/api/admin/finances/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          recipient_id: recipientId,
          recipient_name: recipient?.name ?? null,
          amount_cents: amountCents,
          payment_method: 'ach',
          memo: memo.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't queue the payout", body.error ?? 'Try again.');
        return;
      }
      setOpen(false);
      setAmount('');
      setMemo('');
      setRecipientId('');
      toast.success('Queued for approval', 'Approve it in Mercury to send the money.');
      router.refresh();
    } catch {
      toast.error("Couldn't queue the payout", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  const selectCls =
    'flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink focus-visible:border-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper/30';

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Request a payout
        </Button>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title="No payouts requested"
          description="Queue one here and approve it in Mercury — the CRM can't move money on its own."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                <th className="px-4 py-2.5 font-medium">Requested</th>
                <th className="px-4 py-2.5 font-medium">Recipient</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink-subtle">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-ink">{r.recipientName ?? '—'}</span>
                    {r.memo ? (
                      <span className="block font-sans text-xs text-ink-subtle">{r.memo}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusPill
                      label={STATUS_LABEL[r.status] ?? r.status}
                      tone={STATUS_TONE[r.status] ?? 'bg-surface-2 text-ink-muted'}
                      size="sm"
                    />
                    {r.error ? (
                      <span className="mt-1 block font-sans text-xs text-danger">{r.error}</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono tabular-nums text-ink">
                    {formatUSD(r.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} side="right" width="md" labelledBy="payout-heading">
        <header className="border-b border-border px-6 pb-5 pt-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-meta-hero text-copper">
            Payout
          </p>
          <h2 id="payout-heading" className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
            Request a payout
          </h2>
        </header>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="pay_from">From account</Label>
              <select
                id="pay_from"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={selectCls}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname || a.name} · {formatUSD(a.availableCents)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay_to">Recipient</Label>
              <select
                id="pay_to"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className={selectCls}
                disabled={recipients === null}
              >
                <option value="">
                  {recipients === null ? 'Loading…' : 'Choose a recipient'}
                </option>
                {(recipients ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="font-sans text-xs text-ink-subtle">
                Recipients come from Mercury. Add new ones there — the CRM
                doesn&apos;t store bank details.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay_amount">Amount (USD)</Label>
              <Input
                id="pay_amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay_memo">Memo</Label>
              <Input
                id="pay_memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={300}
                placeholder="August commissions"
              />
            </div>

            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
              <p className="font-sans text-xs text-ink">
                This queues the payment. Nothing moves until you approve it in
                Mercury, and the approver has to be someone other than whoever
                created the API token.
              </p>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !valid}>
              {busy ? 'Queueing…' : `Queue ${amountCents > 0 ? formatUSD(amountCents) : 'payout'}`}
            </Button>
          </footer>
        </form>
      </Drawer>
    </div>
  );
}
