import { requireClient } from '@/lib/auth/guards';
import { clientOwnsSubscription } from '@/lib/queries/client';
import {
  fetchSubscriptionForSync,
  syncSubscriptionRow,
} from '@/lib/care-plan/sync';

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
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
