import { requireClient } from '@/lib/auth/guards';
import { stripe } from '@/lib/stripe';
import { clientOwnsSubscription } from '@/lib/queries/client';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Mints a SetupIntent client_secret so the client can attach a NEW
 * payment method to their existing subscription. The actual
 * "set as default" happens in the /apply route after confirmSetup.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/care-plan/[id]/setup-intent:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const owned = await clientOwnsSubscription(id, session.userId);
    if (!owned) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const s = stripe();
    const intent = await s.setupIntents.create({
      customer: owned.stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return Response.json({ client_secret: intent.client_secret });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/care-plan/[id]/setup-intent', err);
  }
}
