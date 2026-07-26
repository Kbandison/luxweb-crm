import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Schema = z.object({
  action: z.enum(['cancel', 'resume', 'cancel_immediately']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_care_plans');
    const limit = limitByKey(`admin/care-plan/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { data } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select('stripe_subscription_id')
      .eq('id', id)
      .single();
    if (!data) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const stripeSubId = (data as { stripe_subscription_id: string })
      .stripe_subscription_id;

    const s = stripe();
    if (parsed.data.action === 'cancel') {
      await s.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      });
    } else if (parsed.data.action === 'resume') {
      await s.subscriptions.update(stripeSubId, {
        cancel_at_period_end: false,
      });
    } else {
      await s.subscriptions.cancel(stripeSubId);
    }

    const full = await fetchSubscriptionForSync(stripeSubId);
    await syncSubscriptionRow(full);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'care_plan_subscription',
      entity_id: stripeSubId,
      diff: { action: parsed.data.action },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/care-plan/[id]', err);
  }
}
