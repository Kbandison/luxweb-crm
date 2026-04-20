import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectInvoices } from '@/lib/queries/client';
import { reconcileInvoicePaid } from '@/lib/reconcile-invoice';
import { formatDate, formatUSD } from '@/lib/formatters';
import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  type InvoiceStatus,
} from '@/lib/status-meta';
import { cn } from '@/lib/utils';

export default async function ClientProjectInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  // If the client just returned from a successful payment, reconcile the
  // invoice against Stripe before rendering. Closes the window between
  // Stripe's payment_intent.succeeded webhook and our page render.
  const sp = await searchParams;
  if (sp.paid) {
    await reconcileInvoicePaid(sp.paid, session.userId);
  }

  const invoices = await getClientProjectInvoices(id, session.userId);
  if (invoices === null) notFound();

  const open = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const paid = invoices.filter((i) => i.status === 'paid');
  const openCents = open.reduce((s, i) => s + i.amountCents, 0);
  const paidCents = paid.reduce((s, i) => s + i.amountCents, 0);

  return (
    <main className="space-y-8 px-6 py-10 md:px-10">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Open balance"
          value={formatUSD(openCents)}
          hint={`${open.length} ${open.length === 1 ? 'invoice' : 'invoices'}`}
          accent={open.length > 0}
        />
        <Stat
          label="Paid to date"
          value={formatUSD(paidCents)}
          hint={`${paid.length} ${paid.length === 1 ? 'invoice' : 'invoices'}`}
        />
      </div>

      {/* List */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center">
          <p className="font-sans text-sm text-ink-muted">
            No invoices.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li
                key={inv.id}
                className={cn(
                  'flex items-center justify-between gap-4 px-5 py-4',
                  inv.status === 'void' && 'opacity-60',
                  inv.status === 'overdue' && 'bg-danger/5',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-medium text-ink">
                    {inv.description ?? 'Invoice'}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                    {inv.paidAt
                      ? `Paid ${formatDate(inv.paidAt)}`
                      : inv.dueDate
                        ? `Due ${formatDate(inv.dueDate)}`
                        : 'No due date'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]',
                      INVOICE_STATUS_TONE[inv.status as InvoiceStatus] ??
                        'bg-ink/5 text-ink-muted',
                    )}
                  >
                    {INVOICE_STATUS_LABEL[inv.status as InvoiceStatus] ?? inv.status}
                  </span>
                  <span className="font-mono text-sm font-medium tabular-nums text-ink">
                    {formatUSD(inv.amountCents)}
                  </span>
                  {inv.status === 'sent' || inv.status === 'overdue' ? (
                    <Link
                      href={`/portal/project/${id}/invoices/${inv.id}/pay`}
                      className="inline-flex items-center gap-1 rounded-md bg-copper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-copper-foreground transition-colors hover:bg-copper/90"
                    >
                      Pay
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                        aria-hidden
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>
                  ) : inv.status === 'paid' && inv.hostedInvoiceUrl ? (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted hover:text-copper"
                    >
                      Receipt ↗
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-5',
        accent ? 'border-copper/30' : 'border-border',
      )}
    >
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
