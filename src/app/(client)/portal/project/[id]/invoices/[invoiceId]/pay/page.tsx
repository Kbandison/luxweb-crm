import Link from 'next/link';
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
    return <PaymentUnavailable reason="This invoice isn't linked to Stripe." />;
  }

  const s = stripe();
  const stripeInvoice = await s.invoices.retrieve(invoice.stripe_invoice_id);

  // `send_invoice` invoices don't auto-create a PaymentIntent on finalize —
  // Stripe only does that when the customer hits the hosted page. For our
  // custom pay page we create one ourselves, linked back to the invoice via
  // metadata. The payment_intent.succeeded webhook marks the Stripe invoice
  // paid_out_of_band, which then fires invoice.paid and our existing handler
  // flips the CRM row.
  let clientSecret: string | null =
    stripeInvoice.confirmation_secret?.client_secret ?? null;

  if (!clientSecret) {
    const customerId =
      typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : (stripeInvoice.customer?.id ?? null);

    if (!customerId) {
      return (
        <PaymentUnavailable reason="This invoice is missing a Stripe customer." />
      );
    }

    // idempotencyKey makes repeated page loads return the same PaymentIntent
    // instead of racking up fresh ones every refresh.
    const pi = await s.paymentIntents.create(
      {
        amount: Number(invoice.amount_cents ?? 0),
        currency: (stripeInvoice.currency as string) || 'usd',
        customer: customerId,
        payment_method_types: ['card'],
        description: invoice.description ?? 'Invoice',
        metadata: {
          crm_invoice_id: invoice.id,
          stripe_invoice_id: invoice.stripe_invoice_id,
        },
      },
      { idempotencyKey: `pay_invoice_${invoice.id}` },
    );

    clientSecret = pi.client_secret;
  }

  if (!clientSecret) {
    return (
      <PaymentUnavailable reason="Stripe didn't return a payment secret for this invoice." />
    );
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

function PaymentUnavailable({ reason }: { reason: string }) {
  return (
    <main className="min-h-full px-6 py-10 md:px-10">
      <div className="mx-auto max-w-xl space-y-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-copper">
          Invoice
        </p>
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
          Payment not available
        </h1>
        <p className="font-sans text-sm text-ink-muted">{reason}</p>
        <Link
          href="/portal/dashboard"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
