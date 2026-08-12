import { requireCapability } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { syncMercury } from '@/lib/mercury/sync';
import { mercuryConfigured } from '@/lib/mercury/client';

export const runtime = 'nodejs';
// A wide backfill can walk several pages of the Mercury API.
export const maxDuration = 120;

/**
 * POST /api/admin/finances/sync — pull Mercury into the local mirror.
 *
 * Manual counterpart to the nightly cron, for when you want the page current
 * right now. Rate limited because each call fans out to a paid third-party API.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('view_finance');
    const limit = limitByKey(`finances/sync:${session.userId}`, {
      capacity: 6,
      refillPerSec: 6 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    if (!mercuryConfigured()) {
      return Response.json(
        { error: 'Mercury is not connected. Set MERCURY_API_TOKEN.' },
        { status: 400 },
      );
    }

    // Optional wider window for a first run or a backfill.
    const raw = await req.json().catch(() => ({}));
    const days = Number(raw?.days);
    const sinceDays =
      Number.isFinite(days) && days > 0 ? Math.min(Math.floor(days), 730) : undefined;

    const result = await syncMercury({ sinceDays });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'bank_sync',
      diff: result,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/sync', err);
  }
}
