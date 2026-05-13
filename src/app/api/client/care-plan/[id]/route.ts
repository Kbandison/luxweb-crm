import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { stripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';
import { clientOwnsSubscription } from '@/lib/queries/client';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Schema = z.object({
  action: z.enum(['cancel', 'resume']),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/care-plan/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
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

    const owned = await clientOwnsSubscription(id, session.userId);
    if (!owned) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const s = stripe();
    await s.subscriptions.update(owned.stripeSubscriptionId, {
      cancel_at_period_end: parsed.data.action === 'cancel',
    });

    const full = await fetchSubscriptionForSync(owned.stripeSubscriptionId);
    await syncSubscriptionRow(full);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'care_plan_subscription',
      entity_id: owned.stripeSubscriptionId,
      diff: { action: parsed.data.action, by: 'client' },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/care-plan/[id]', err);
  }
}
