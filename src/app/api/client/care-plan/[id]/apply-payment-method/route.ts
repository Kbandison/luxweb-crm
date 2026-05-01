import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import { clientOwnsSubscription } from '@/lib/queries/client';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';

export const runtime = 'nodejs';

const Schema = z.object({
  payment_method_id: z.string().min(1).max(200),
});

/**
 * After the client successfully confirms a SetupIntent in the browser,
 * the resulting payment_method id is sent here. We attach it to the
 * customer (no-op if already attached), set it as the customer's default
 * for invoices, and as the default for the subscription itself.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const owned = await clientOwnsSubscription(id, session.userId);
    if (!owned) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const s = stripe();
    const pmId = parsed.data.payment_method_id;

    // Attach (idempotent — Stripe returns InvalidRequestError if already
    // attached to a different customer, but for our flow it's the same one).
    try {
      await s.paymentMethods.attach(pmId, { customer: owned.stripeCustomerId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Already attached to this customer is fine.
      if (!msg.includes('already been attached')) throw err;
    }

    await s.customers.update(owned.stripeCustomerId, {
      invoice_settings: { default_payment_method: pmId },
    });

    await s.subscriptions.update(owned.stripeSubscriptionId, {
      default_payment_method: pmId,
    });

    const full = await fetchSubscriptionForSync(owned.stripeSubscriptionId);
    await syncSubscriptionRow(full);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'care_plan_subscription',
      entity_id: owned.stripeSubscriptionId,
      diff: { action: 'update_payment_method' },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
