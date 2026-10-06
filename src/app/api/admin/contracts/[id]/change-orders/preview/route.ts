import { requireCapability } from '@/lib/auth/guards';
import { loadAmendable, renderChangeOrder } from '@/lib/change-orders/service';
import { DraftSchema, toDraft } from '@/lib/change-orders/schema';
import { formatUSD } from '@/lib/formatters';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/** POST — render a change order exactly as it would be sent. Saves nothing. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const limit = limitByKey(`admin/change-orders/preview:${session.userId}`, { capacity: 60, refillPerSec: 1 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const parsed = DraftSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change order' }, { status: 400 });
    }
    const amendable = await loadAmendable(id);
    if (!amendable) {
      return Response.json({ error: 'Only a signed agreement can take a change order.' }, { status: 409 });
    }
    const draft = toDraft(parsed.data);
    const { bodyMd } = await renderChangeOrder(amendable, draft, amendable.nextNumber);
    return Response.json({
      body_md: bodyMd,
      number: amendable.nextNumber,
      previous_total: formatUSD(amendable.currentTotalCents),
      new_total: formatUSD(amendable.currentTotalCents + draft.amountCents),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contracts/[id]/change-orders/preview', err);
  }
}
