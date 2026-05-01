import type Stripe from 'stripe';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import {
  ensureStripeCustomer,
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';

export const runtime = 'nodejs';

const Schema = z.object({
  trial_period_days: z.number().int().min(1).max(365).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id: projectId } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const trialDays = parsed.data.trial_period_days ?? null;

    const priceId = process.env.STRIPE_CARE_PLAN_PRICE_ID;
    if (!priceId) {
      return Response.json(
        { error: 'STRIPE_CARE_PLAN_PRICE_ID is not configured.' },
        { status: 500 },
      );
    }

    // Existing active sub for this project? Don't double-enroll.
    const { data: existing } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['incomplete', 'trialing', 'active', 'past_due'])
      .limit(1);
    if ((existing?.length ?? 0) > 0) {
      return Response.json(
        { error: 'This project already has an active or pending Care Plan.' },
        { status: 409 },
      );
    }

    const { data: project } = await supabaseAdmin()
      .from('projects')
      .select(
        'id, contact_id, contacts!inner(full_name, email)',
      )
      .eq('id', projectId)
      .single();
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    type ProjectRow = {
      contact_id: string;
      contacts:
        | { full_name: string; email: string | null }
        | { full_name: string; email: string | null }[];
    };
    const p = project as unknown as ProjectRow;
    const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    if (!contact?.email) {
      return Response.json(
        { error: 'Contact is missing an email address.' },
        { status: 400 },
      );
    }

    const customerId = await ensureStripeCustomer(
      p.contact_id,
      contact.email,
      contact.full_name,
    );

    const s = stripe();
    const subParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        project_id: projectId,
        contact_id: p.contact_id,
        plan: 'care_plan',
      },
    };
    if (trialDays) subParams.trial_period_days = trialDays;
    const sub = await s.subscriptions.create(subParams);

    // Refresh with the same expansions used by the helper for shape parity.
    let full: Stripe.Subscription = sub;
    try {
      full = await fetchSubscriptionForSync(sub.id);
    } catch {
      /* fall through with create() result */
    }
    await syncSubscriptionRow(full);

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'care_plan_subscription',
      entity_id: sub.id,
      diff: {
        project_id: projectId,
        contact_id: p.contact_id,
        price_id: priceId,
        trial_period_days: trialDays,
      },
    });

    return Response.json({ ok: true, subscription_id: sub.id });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
