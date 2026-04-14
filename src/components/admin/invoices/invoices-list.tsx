'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvoiceRow } from '@/lib/queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InvoiceStatusPill } from './invoice-status-pill';
import { formatDate, formatUSD } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function InvoicesList({
  projectId,
  initial,
}: {
  projectId: string;
  initial: InvoiceRow[];
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voiding, setVoiding] = useState<InvoiceRow | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);

  const openCount = initial.filter(
    (i) => i.status === 'sent' || i.status === 'overdue',
  ).length;
  const openCents = initial
    .filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + i.amountCents, 0);
  const paidCents = initial
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.amountCents, 0);

  async function confirmVoid() {
    if (!voiding) return;
    setVoidBusy(true);
    try {
      await fetch(`/api/admin/invoices/${voiding.id}/void`, {
        method: 'POST',
      });
    } finally {
      setVoidBusy(false);
      setVoiding(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-medium tracking-tight text-ink">
            Invoices
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
            {initial.length} total · {openCount} open
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setDrawerOpen(true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New invoice
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Open balance"
          value={formatUSD(openCents)}
          hint={`${openCount} ${openCount === 1 ? 'invoice' : 'invoices'}`}
        />
        <Stat
          label="Paid to date"
          value={formatUSD(paidCents)}
          hint="Excludes voided"
        />
      </div>

      {/* List */}
      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No invoices. Use the button above to bill this client via
            Stripe.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-border bg-surface text-left">
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Due</th>
                <th className="px-3 py-3 font-medium">Sent</th>
                <th className="w-44 px-5 py-3 text-right" />
              </tr>
            </thead>
            <tbody>
              {initial.map((inv) => (
                <tr
                  key={inv.id}
                  className={cn(
                    'border-b border-border last:border-b-0',
                    inv.status === 'void' && 'opacity-60',
                  )}
                >
                  <td className="px-5 py-3">
                    <p className="font-sans text-sm text-ink">
                      {inv.description ?? '—'}
                    </p>
                    {inv.stripeInvoiceId ? (
                      <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
                        {inv.stripeInvoiceId}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <InvoiceStatusPill status={inv.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                    {formatUSD(inv.amountCents)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                    {formatDate(inv.dueDate)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {inv.hostedInvoiceUrl ? (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
                        >
                          Open ↗
                        </a>
                      ) : null}
                      {inv.status !== 'paid' && inv.status !== 'void' ? (
                        <button
                          type="button"
                          onClick={() => setVoiding(inv)}
                          className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          Void
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewInvoiceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={projectId}
      />

      <ConfirmDialog
        open={voiding !== null}
        tone="danger"
        title="Void invoice"
        description={
          voiding ? (
            <>
              Voids{' '}
              <span className="font-mono text-ink">
                {formatUSD(voiding.amountCents)}
              </span>{' '}
              in Stripe and marks it void in the CRM. Clients will see it as
              cancelled. Paid invoices can&apos;t be voided — refund instead.
            </>
          ) : null
        }
        confirmLabel="Void invoice"
        busy={voidBusy}
        onCancel={() => (voidBusy ? undefined : setVoiding(null))}
        onConfirm={confirmVoid}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </p>
      <p className="mt-3 font-mono text-2xl font-medium tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 font-sans text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * New invoice drawer
 * ------------------------------------------------------------------------- */
function NewInvoiceDrawer({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [daysUntilDue, setDaysUntilDue] = useState('14');

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, busy, onClose]);

  function reset() {
    setDescription('');
    setAmountDollars('');
    setDaysUntilDue('14');
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const dollars = Number(amountDollars);
    if (!dollars || dollars < 1) {
      setError('Amount must be at least $1.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          amount_cents: Math.round(dollars * 100),
          description: description.trim(),
          days_until_due: Number(daysUntilDue) || 14,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to create invoice.');
        return;
      }
      reset();
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm"
          onClick={!busy ? onClose : undefined}
          aria-hidden
        />
      ) : null}

      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md transform flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="relative isolate overflow-hidden border-b border-border px-6 pb-5 pt-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-copper/20 via-gold/10 to-transparent blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
                New invoice
              </p>
              <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-ink">
                Bill the client
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md border border-border bg-surface p-2 text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div className="space-y-1.5">
              <Label htmlFor="inv_description">Description</Label>
              <Input
                id="inv_description"
                required
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Deposit · Signature site build"
              />
              <p className="font-sans text-xs text-ink-subtle">
                Shows on the client&apos;s Stripe invoice.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv_amount">Amount (USD)</Label>
                <Input
                  id="inv_amount"
                  type="number"
                  min={1}
                  step="0.01"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  placeholder="2500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv_days">Days until due</Label>
                <Input
                  id="inv_days"
                  type="number"
                  min={1}
                  max={365}
                  value={daysUntilDue}
                  onChange={(e) => setDaysUntilDue(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-copper/20 bg-copper-soft/30 p-4">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-copper">
                What happens on submit
              </p>
              <ul className="mt-2 space-y-1 font-sans text-xs leading-relaxed text-ink">
                <li>· Finds or creates the Stripe customer by contact email</li>
                <li>· Creates + finalizes the invoice in Stripe</li>
                <li>· Stripe emails the client with the hosted payment link</li>
                <li>· Mirrors the row in the CRM for tracking</li>
              </ul>
            </div>

            {error ? (
              <p role="alert" className="font-sans text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !description.trim() || !amountDollars}
            >
              {busy ? 'Sending…' : 'Send invoice'}
            </Button>
          </footer>
        </form>
      </aside>
    </>
  );
}
