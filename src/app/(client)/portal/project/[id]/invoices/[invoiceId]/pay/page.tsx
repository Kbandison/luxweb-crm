import { notFound, redirect } from 'next/navigation';
import { requireProjectAccess } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { InvoicePayment } from '@/components/portal/invoice-payment';
import { formatUSD, formatDate } from '@/lib/formatters';

export const runtime = 'nodejs';

export default async function InvoicePayPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id: projectId, invoiceId } = await params;
  await requireProjectAccess(projectId);

  const { data: invoice } = await supabaseAdmin()
    .from('invoices')
    .select(
      'id, project_id, status, description, amount_cents, due_date, stripe_invoice_id, hosted_invoice_url',
    )
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .single();

  if (!invoice) notFound();

  // Already paid / voided / draft — nothing to pay here.
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    redirect(`/portal/project/${projectId}/invoices`);
  }
  if (!invoice.stripe_invoice_id) {
    // Legacy or broken — fall back to hosted page if we have one, otherwise list.
    if (invoice.hosted_invoice_url) redirect(invoice.hosted_invoice_url);
    redirect(`/portal/project/${projectId}/invoices`);
  }

  const s = stripe();
  const stripeInvoice = await s.invoices.retrieve(invoice.stripe_invoice_id);

  // Stripe 2024+ surfaces the PaymentIntent's client_secret as
  // `confirmation_secret` on the invoice itself — no expand needed.
  const clientSecret = stripeInvoice.confirmation_secret?.client_secret ?? null;

  if (!clientSecret) {
    // Missing secret — fall back to hosted page so the client isn't stuck.
    if (invoice.hosted_invoice_url) redirect(invoice.hosted_invoice_url);
    redirect(`/portal/project/${projectId}/invoices`);
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  }

  const amountCents = Number(invoice.amount_cents ?? 0);

  return (
    <main className="min-h-full px-6 py-10 md:px-10">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-copper">
            Invoice
          </p>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
            {invoice.description ?? 'Invoice'}
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : 'No due date'}
          </p>
        </header>

        <div className="rounded-xl border border-copper/30 bg-surface p-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            Amount due
          </p>
          <p className="mt-2 font-mono text-4xl font-medium tabular-nums tracking-tight text-ink">
            {formatUSD(amountCents)}
          </p>
        </div>

        <InvoicePayment
          clientSecret={clientSecret}
          publishableKey={publishableKey}
          returnUrl={`/portal/project/${projectId}/invoices?paid=${invoice.id}`}
          cancelHref={`/portal/project/${projectId}/invoices`}
        />
      </div>
    </main>
  );
}
