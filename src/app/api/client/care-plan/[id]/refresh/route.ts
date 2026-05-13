import { requireClient } from '@/lib/auth/guards';
import { clientOwnsSubscription } from '@/lib/queries/client';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Force-resync from Stripe. Used by the activate flow after the client
 * confirms payment in Elements — we don't want the UI to wait on the
 * webhook to flip the row to active.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/care-plan/[id]/refresh:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const owned = await clientOwnsSubscription(id, session.userId);
    if (!owned) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const full = await fetchSubscriptionForSync(owned.stripeSubscriptionId);
    await syncSubscriptionRow(full);

    return Response.json({ ok: true, status: full.status });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/care-plan/[id]/refresh', err);
  }
}
