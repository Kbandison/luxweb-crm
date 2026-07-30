import { requireCapability } from '@/lib/auth/guards';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { lookupProspects } from '@/lib/outreach/dedupe';

export const runtime = 'nodejs';

/**
 * GET /api/outreach/prospects/lookup?q= — "is anyone already calling this?"
 * Searches every setter's list by phone (digits, formatting-agnostic), business
 * name, contact name, or email. Returns owner + status + last dial only, so a
 * setter can avoid a double-dial without reading someone else's notes.
 */
export async function GET(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/lookup:${session.userId}`, {
      capacity: 60,
      refillPerSec: 1,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const q = new URL(req.url).searchParams.get('q') ?? '';
    const matches = await lookupProspects(q, session.userId);
    return Response.json({
      matches: matches.map((m) => ({
        kind: m.kind,
        fullName: m.fullName,
        company: m.company,
        phone: m.phone,
        status: m.status,
        attempts: m.attempts,
        lastContactedAt: m.lastContactedAt,
        ownerName: m.ownerName,
        mine: m.mine,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/lookup', err);
  }
}
