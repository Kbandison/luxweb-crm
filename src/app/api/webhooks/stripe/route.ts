import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

// Signature verification requires the raw body — Next's `.text()` preserves
// the bytes. Don't use `.json()` before verifying.
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return Response.json(
      { error: 'Missing signature or webhook secret' },
      { status: 400 },
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
      case 'invoice.marked_uncollectible':
        await handleInvoiceOverdue(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionActive(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        // Stripe sends lots of event types we don't care about. Ack 200
        // so it doesn't retry indefinitely.
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] ${event.type} failed:`, err);
    // Still 200 — Stripe retries cause duplicate work. Errors surface in
    // our logs; the idempotent UPDATEs mean a retry-after-fix is safe.
  }

  return Response.json({ received: true });
}

/* --------------------------- handlers ----------------------------------- */

async function handleInvoicePaid(inv: Stripe.Invoice) {
  if (!inv.id) return;
  const paidAt = new Date().toISOString();

  // Mirror the status — naturally idempotent on replay since the UPDATE
  // only sets the same columns to the same values.
  const { data: row } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('stripe_invoice_id', inv.id)
    .select('id, contact_id, project_id, amount_cents, description, hosted_invoice_url')
    .single();

  if (!row) return;

  await writeAudit({
    actor_id: null as unknown as string, // system event
    action: 'update',
    entity_type: 'invoice',
    entity_id: row.id as string,
    diff: { status: { from: 'sent', to: 'paid' }, paid_at: paidAt },
  });

  const userId = await getContactUserId(row.contact_id as string);
  if (userId) {
    const projectId = row.project_id as string | null;
    await notify({
      type: 'invoice_paid',
      userId,
      invoiceId: row.id as string,
      description: (row.description as string | null) ?? 'Invoice',
      amountCents: Number(row.amount_cents ?? 0),
      paidAt,
      hostedInvoiceUrl: (row.hosted_invoice_url as string | null) ?? null,
      invoicePath: projectId
        ? `/portal/project/${projectId}/invoices`
        : '/portal/dashboard',
    });
  }
}

async function handleInvoiceOverdue(inv: Stripe.Invoice) {
  if (!inv.id) return;
  const { data: row } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('stripe_invoice_id', inv.id)
    .select('id')
    .single();
  if (!row) return;

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'invoice',
    entity_id: row.id as string,
    diff: { status: 'overdue' },
  });
}

async function handleSubscriptionActive(sub: Stripe.Subscription) {
  const projectId =
    typeof sub.metadata?.project_id === 'string' ? sub.metadata.project_id : null;
  if (!projectId) return;
  if (sub.status !== 'active') return;

  const { error } = await supabaseAdmin()
    .from('projects')
    .update({ status: 'in_progress' })
    .eq('id', projectId);
  if (error) return;

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'project',
    entity_id: projectId,
    diff: { subscription_status: sub.status, source: 'stripe_webhook' },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const projectId =
    typeof sub.metadata?.project_id === 'string' ? sub.metadata.project_id : null;
  if (!projectId) return;

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'project',
    entity_id: projectId,
    diff: { subscription: 'cancelled', source: 'stripe_webhook' },
  });
}
