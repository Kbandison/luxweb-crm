import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId, getContactUserId } from '@/lib/notifications';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';

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
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
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
  const stripeInvoiceId = inv.id;
  const paidAt = new Date().toISOString();

  // Notification data comes from the Stripe payload — authoritative and
  // independent of our schema cache. If `description` / `hosted_invoice_url`
  // ever drift out of PostgREST's cache, notifications still fire correctly.
  const description = pickDescription(inv);
  const amountCents = inv.amount_paid ?? inv.amount_due ?? 0;
  const hostedInvoiceUrl = inv.hosted_invoice_url ?? null;

  // Minimal-column SELECT — only depends on schema fields that have existed
  // since the original migration. No `description`, no `due_date`, no URLs.
  const { data: existing, error: fetchErr } = await supabaseAdmin()
    .from('invoices')
    .select('id, contact_id, project_id, status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (fetchErr || !existing) {
    await logWebhookIssue({
      stripeInvoiceId,
      eventType: 'invoice.paid',
      stage: 'fetch',
      message: fetchErr?.message ?? 'No matching crm.invoices row',
    });
    return;
  }

  const crmInvoiceId = existing.id as string;
  const contactId = existing.contact_id as string;
  const projectId = existing.project_id as string | null;
  const previousStatus = existing.status as string;

  // Separate UPDATE. Tolerant to schema-cache drift since we don't SELECT
  // any possibly-unknown columns back.
  const { error: updateErr } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', crmInvoiceId);

  if (updateErr) {
    await logWebhookIssue({
      stripeInvoiceId,
      eventType: 'invoice.paid',
      stage: 'update',
      message: updateErr.message,
      crmInvoiceId,
    });
    return;
  }

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'invoice',
    entity_id: crmInvoiceId,
    diff: {
      status: { from: previousStatus, to: 'paid' },
      paid_at: paidAt,
      source: 'stripe_webhook',
    },
  });

  // Idempotency: if the row was already marked paid, don't re-fire emails
  // or notifications. Stripe retries + our own manual resends both covered.
  if (previousStatus === 'paid') return;

  const clientUserId = await getContactUserId(contactId);
  if (clientUserId) {
    await notify({
      type: 'invoice_paid',
      userId: clientUserId,
      invoiceId: crmInvoiceId,
      description,
      amountCents,
      paidAt,
      hostedInvoiceUrl,
      invoicePath: projectId
        ? `/portal/project/${projectId}/invoices`
        : '/portal/dashboard',
    });
  }

  const adminId = await getAdminUserId();
  if (adminId) {
    await notify({
      type: 'invoice_paid',
      userId: adminId,
      invoiceId: crmInvoiceId,
      description,
      amountCents,
      paidAt,
      hostedInvoiceUrl,
      invoicePath: projectId
        ? `/admin/projects/${projectId}/invoices`
        : '/admin/dashboard',
    });
  }
}

async function handleInvoiceOverdue(inv: Stripe.Invoice) {
  if (!inv.id) return;
  const stripeInvoiceId = inv.id;

  const description = pickDescription(inv);
  const amountCents = inv.amount_due ?? inv.amount_remaining ?? 0;
  const hostedInvoiceUrl = inv.hosted_invoice_url ?? null;
  const dueDate = inv.due_date
    ? new Date(inv.due_date * 1000).toISOString().slice(0, 10)
    : null;

  const { data: existing, error: fetchErr } = await supabaseAdmin()
    .from('invoices')
    .select('id, contact_id, project_id, status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle();

  if (fetchErr || !existing) {
    await logWebhookIssue({
      stripeInvoiceId,
      eventType: 'invoice.overdue',
      stage: 'fetch',
      message: fetchErr?.message ?? 'No matching crm.invoices row',
    });
    return;
  }

  const crmInvoiceId = existing.id as string;
  const contactId = existing.contact_id as string;
  const projectId = existing.project_id as string | null;
  const previousStatus = existing.status as string;

  // Don't downgrade a paid or voided invoice back to overdue.
  if (previousStatus === 'paid' || previousStatus === 'void') return;

  const { error: updateErr } = await supabaseAdmin()
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('id', crmInvoiceId);

  if (updateErr) {
    await logWebhookIssue({
      stripeInvoiceId,
      eventType: 'invoice.overdue',
      stage: 'update',
      message: updateErr.message,
      crmInvoiceId,
    });
    return;
  }

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'invoice',
    entity_id: crmInvoiceId,
    diff: {
      status: { from: previousStatus, to: 'overdue' },
      source: 'stripe_webhook',
    },
  });

  // Idempotency — only notify on actual transition into overdue.
  if (previousStatus === 'overdue') return;

  const clientUserId = await getContactUserId(contactId);
  if (clientUserId) {
    await notify({
      type: 'invoice_overdue',
      userId: clientUserId,
      invoiceId: crmInvoiceId,
      description,
      amountCents,
      dueDate,
      hostedInvoiceUrl,
      invoicePath: projectId
        ? `/portal/project/${projectId}/invoices`
        : '/portal/dashboard',
    });
  }

  const adminId = await getAdminUserId();
  if (adminId) {
    await notify({
      type: 'invoice_overdue',
      userId: adminId,
      invoiceId: crmInvoiceId,
      description,
      amountCents,
      dueDate,
      hostedInvoiceUrl,
      invoicePath: projectId
        ? `/admin/projects/${projectId}/invoices`
        : '/admin/dashboard',
    });
  }
}

/* ------------------------- internal helpers ----------------------------- */

function pickDescription(inv: Stripe.Invoice): string {
  if (typeof inv.description === 'string' && inv.description.trim()) {
    return inv.description;
  }
  const first = inv.lines?.data?.[0]?.description;
  if (typeof first === 'string' && first.trim()) return first;
  return 'Invoice';
}

/**
 * Writes a diagnostic row to crm.audit_log when the webhook silently
 * fails. Surfaces in the admin audit viewer so you never have to grep
 * Vercel logs to figure out why a Stripe payment didn't sync.
 */
async function logWebhookIssue(args: {
  stripeInvoiceId: string;
  eventType: string;
  stage: 'fetch' | 'update';
  message: string;
  crmInvoiceId?: string;
}) {
  try {
    await writeAudit({
      actor_id: null as unknown as string,
      action: 'stripe_webhook_failure',
      entity_type: 'invoice',
      entity_id: args.crmInvoiceId,
      diff: {
        stripe_invoice_id: args.stripeInvoiceId,
        event_type: args.eventType,
        stage: args.stage,
        message: args.message,
      },
    });
  } catch (err) {
    // Last-resort log — if even audit_log is broken, there's nothing else
    // to do from the webhook thread.
    console.warn('[stripe webhook] audit_log write failed:', err);
  }
  console.warn('[stripe webhook]', args.eventType, args.stage, 'failed:', args);
}

/**
 * Fires when a PaymentIntent we created for an invoice (see
 * /portal/.../invoices/.../pay) completes. We mark the underlying Stripe
 * invoice as paid_out_of_band so Stripe's books stay consistent — that in
 * turn fires `invoice.paid`, which our existing handler picks up to flip
 * the CRM row and send notifications.
 */
async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const stripeInvoiceId =
    typeof pi.metadata?.stripe_invoice_id === 'string'
      ? pi.metadata.stripe_invoice_id
      : null;
  if (!stripeInvoiceId) return; // not one of ours

  const s = stripe();
  try {
    await s.invoices.pay(stripeInvoiceId, { paid_out_of_band: true });
  } catch (err) {
    // Already paid or finalized in a non-payable state — invoice.paid may
    // have already fired, or this is a duplicate retry. Swallow.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      '[stripe webhook] paid_out_of_band on',
      stripeInvoiceId,
      'failed:',
      message,
    );
  }
}

async function handleSubscriptionActive(sub: Stripe.Subscription) {
  // Capture the previous DB status BEFORE we sync, so we can detect the
  // first-time transition into 'active' and notify exactly once.
  const { data: prevRow } = await supabaseAdmin()
    .from('care_plan_subscriptions')
    .select('status')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();
  const previousStatus =
    (prevRow as { status: string } | null)?.status ?? null;

  // Re-fetch with expansions so syncSubscriptionRow has the payment intent
  // + default payment method. The webhook payload itself isn't expanded.
  let full: Stripe.Subscription;
  try {
    full = await fetchSubscriptionForSync(sub.id);
  } catch {
    full = sub;
  }
  await syncSubscriptionRow(full);

  const projectId =
    typeof sub.metadata?.project_id === 'string' ? sub.metadata.project_id : null;

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'update',
    entity_type: 'care_plan_subscription',
    entity_id: sub.id,
    diff: {
      subscription_status: sub.status,
      project_id: projectId,
      source: 'stripe_webhook',
    },
  });

  // Bump project status when the sub becomes active.
  if (projectId && sub.status === 'active') {
    await supabaseAdmin()
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', projectId);
  }

  // Email + in-app notify the client on the first transition into active.
  if (sub.status === 'active' && previousStatus !== 'active') {
    await notifyCarePlanActivated({ sub: full, projectId });
  }
}

async function notifyCarePlanActivated(opts: {
  sub: Stripe.Subscription;
  projectId: string | null;
}) {
  const { sub, projectId } = opts;

  // Pull the row we just synced for amount + interval (mirror columns).
  const { data: row } = await supabaseAdmin()
    .from('care_plan_subscriptions')
    .select('amount_cents, interval, contact_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();
  const r = row as
    | { amount_cents: number; interval: 'month' | 'year'; contact_id: string }
    | null;
  if (!r) return;

  const userId = await getContactUserId(r.contact_id);
  if (!userId) return;

  let projectName: string | null = null;
  if (projectId) {
    const { data: p } = await supabaseAdmin()
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();
    projectName = (p as { name: string } | null)?.name ?? null;
  }

  await notify({
    type: 'care_plan_activated',
    userId,
    subscriptionId: sub.id,
    projectId,
    projectName,
    amountCents: r.amount_cents,
    interval: r.interval,
    portalPath: projectId ? `/portal/project/${projectId}` : '/portal/dashboard',
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await syncSubscriptionRow(sub);

  await writeAudit({
    actor_id: null as unknown as string,
    action: 'delete',
    entity_type: 'care_plan_subscription',
    entity_id: sub.id,
    diff: { source: 'stripe_webhook' },
  });
}
