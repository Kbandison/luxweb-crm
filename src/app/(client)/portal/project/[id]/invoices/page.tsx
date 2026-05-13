import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  getClientProjectInvoices,
  type ClientInvoice,
} from '@/lib/queries/client';
import { reconcileInvoicePaid } from '@/lib/reconcile-invoice';
import { StatCard } from '@/components/ui/stat-card';
import { SectionHead } from '@/components/ui/section-head';
import { StatusPill } from '@/components/ui/status-pill';
import { buttonVariants } from '@/components/ui/button';
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

  const open = invoices.filter(
    (i) => i.status === 'sent' || i.status === 'overdue',
  );
  const paid = invoices.filter((i) => i.status === 'paid');
  const voided = invoices.filter((i) => i.status === 'void');
  const openCents = open.reduce((s, i) => s + i.amountCents, 0);
  const paidCents = paid.reduce((s, i) => s + i.amountCents, 0);

  return (
    <main className="space-y-8 px-6 py-10 md:px-10">
      {/* Page heading */}
      <SectionHead title="Invoices" />

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Currently due"
          value={formatUSD(openCents)}
          hint={`${open.length} ${open.length === 1 ? 'invoice' : 'invoices'}`}
          size="md"
          className={open.length > 0 ? 'border-copper/30' : undefined}
        />
        <StatCard
          label="Paid to date"
          value={formatUSD(paidCents)}
          hint={`${paid.length} ${paid.length === 1 ? 'invoice' : 'invoices'}`}
          size="md"
        />
      </div>

      {/* Sections */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/60 p-10 text-center">
          <p className="font-sans text-sm text-ink-muted">No invoices yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <InvoiceSection
            label="Currently due"
            tone="copper"
            invoices={open}
            projectId={id}
            empty="Nothing waiting — you're all caught up."
          />
          <InvoiceSection
            label="Paid"
            tone="muted"
            invoices={paid}
            projectId={id}
            empty="No paid invoices yet."
          />
          {voided.length > 0 ? (
            <InvoiceSection
              label="Voided"
              tone="muted"
              invoices={voided}
              projectId={id}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}

function InvoiceSection({
  label,
  tone,
  invoices,
  projectId,
  empty,
}: {
  label: string;
  tone: 'copper' | 'muted';
  invoices: ClientInvoice[];
  projectId: string;
  empty?: string;
}) {
  return (
    <section>
      <p
        className={cn(
          'mb-3 font-mono text-[10px] font-medium uppercase tracking-meta-hero',
          tone === 'copper' ? 'text-copper' : 'text-ink-muted',
        )}
      >
        {label}
        <span className="ml-2 tabular-nums text-ink-subtle">
          {invoices.length}
        </span>
      </p>
      {invoices.length === 0 ? (
        empty ? (
          <p className="rounded-xl border border-dashed border-border bg-surface/60 px-5 py-6 text-center font-sans text-sm text-ink-muted">
            {empty}
          </p>
        ) : null
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
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
                    {inv.paidAt
                      ? `Paid ${formatDate(inv.paidAt)}`
                      : inv.dueDate
                        ? `Due ${formatDate(inv.dueDate)}`
                        : 'No due date'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill
                    label={
                      INVOICE_STATUS_LABEL[inv.status as InvoiceStatus] ??
                      inv.status
                    }
                    tone={
                      INVOICE_STATUS_TONE[inv.status as InvoiceStatus] ??
                      'bg-ink/5 text-ink-muted'
                    }
                  />
                  <span className="font-mono text-sm font-medium tabular-nums text-ink">
                    {formatUSD(inv.amountCents)}
                  </span>
                  {inv.status === 'sent' || inv.status === 'overdue' ? (
                    <Link
                      href={`/portal/project/${projectId}/invoices/${inv.id}/pay`}
                      className={buttonVariants({ variant: 'primary', size: 'sm' })}
                    >
                      Pay →
                    </Link>
                  ) : inv.status === 'paid' && inv.hostedInvoiceUrl ? (
                    <a
                      href={inv.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] uppercase tracking-meta-tight text-ink-muted hover:text-copper"
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
    </section>
  );
}

