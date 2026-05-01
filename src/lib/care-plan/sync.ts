import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Resolve the full subscription with the fields we care about: latest invoice
 * payment intent (for activation client_secret) and default payment method.
 */
export async function fetchSubscriptionForSync(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe().subscriptions.retrieve(subscriptionId, {
    expand: [
      'latest_invoice.payment_intent',
      'default_payment_method',
    ],
  });
}

/**
 * Pull the period boundaries from a subscription. Stripe shifted these to
 * the items array on newer API versions, so we read both shapes.
 */
function getPeriod(sub: Stripe.Subscription): {
  start: number | null;
  end: number | null;
} {
  const subAny = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  if (subAny.current_period_start && subAny.current_period_end) {
    return {
      start: subAny.current_period_start,
      end: subAny.current_period_end,
    };
  }
  const item = sub.items?.data?.[0];
  if (item) {
    const itemAny = item as unknown as {
      current_period_start?: number;
      current_period_end?: number;
    };
    return {
      start: itemAny.current_period_start ?? null,
      end: itemAny.current_period_end ?? null,
    };
  }
  return { start: null, end: null };
}

function pickClientSecret(sub: Stripe.Subscription): string | null {
  const inv = sub.latest_invoice;
  if (!inv || typeof inv === 'string') return null;
  const invAny = inv as unknown as {
    payment_intent?: Stripe.PaymentIntent | string | null;
  };
  const pi = invAny.payment_intent;
  if (!pi || typeof pi === 'string') return null;
  return pi.client_secret ?? null;
}

function pickPaymentMethod(sub: Stripe.Subscription): {
  brand: string | null;
  last4: string | null;
} {
  const pm = sub.default_payment_method;
  if (!pm || typeof pm === 'string' || !pm.card) {
    return { brand: null, last4: null };
  }
  return { brand: pm.card.brand, last4: pm.card.last4 };
}

/**
 * Upsert the CRM mirror row from a Stripe Subscription. Used by:
 *   - Admin enroll (after creating the sub)
 *   - Webhook (customer.subscription.created/updated/deleted)
 *   - Client activate (after confirmPayment to refresh state)
 *
 * Project + contact are pulled from subscription metadata (set at create
 * time) — Stripe doesn't know about either on its own.
 */
export async function syncSubscriptionRow(
  sub: Stripe.Subscription,
): Promise<void> {
  const projectId =
    typeof sub.metadata?.project_id === 'string' ? sub.metadata.project_id : null;
  const contactId =
    typeof sub.metadata?.contact_id === 'string' ? sub.metadata.contact_id : null;
  if (!contactId) {
    // Not one of ours — silently skip rather than fail the webhook.
    return;
  }

  const item = sub.items?.data?.[0];
  if (!item?.price) return;

  const { start, end } = getPeriod(sub);
  const pm = pickPaymentMethod(sub);
  const clientSecret = pickClientSecret(sub);

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const payload = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    project_id: projectId,
    contact_id: contactId,
    stripe_price_id: item.price.id,
    amount_cents: item.price.unit_amount ?? 0,
    currency: item.price.currency,
    interval: item.price.recurring?.interval ?? 'month',
    status: sub.status,
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null,
    payment_method_brand: pm.brand,
    payment_method_last4: pm.last4,
    pending_client_secret:
      sub.status === 'incomplete' ? clientSecret : null,
  };

  await supabaseAdmin()
    .from('care_plan_subscriptions')
    .upsert(payload, { onConflict: 'stripe_subscription_id' });

  // Also cache stripe_customer_id on the contact for future flows.
  await supabaseAdmin()
    .from('contacts')
    .update({ stripe_customer_id: customerId })
    .eq('id', contactId)
    .is('stripe_customer_id', null);
}

/**
 * Find or create a Stripe Customer for a contact. Caches the id on the
 * contact row so subsequent calls are O(1).
 */
export async function ensureStripeCustomer(
  contactId: string,
  email: string,
  fullName: string,
): Promise<string> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('contacts')
    .select('stripe_customer_id')
    .eq('id', contactId)
    .single();

  type Row = { stripe_customer_id: string | null };
  const r = (existing as Row | null)?.stripe_customer_id ?? null;
  if (r) return r;

  const s = stripe();
  const list = await s.customers.list({ email, limit: 1 });
  const customer =
    list.data[0] ??
    (await s.customers.create({
      email,
      name: fullName,
      metadata: { contact_id: contactId },
    }));

  await sb
    .from('contacts')
    .update({ stripe_customer_id: customer.id })
    .eq('id', contactId);

  return customer.id;
}
