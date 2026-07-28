import { NextResponse, type NextRequest } from 'next/server';
import { requireCapability } from '@/lib/auth/guards';
import { getAvailableSlots } from '@/lib/outreach/availability';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * GET /api/outreach/availability?duration=30&days=10 — open slots on the
 * owner's calendar (business hours minus busy times). Used by the booking
 * drawer so setters only pick free times.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/availability:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const duration = Number(req.nextUrl.searchParams.get('duration')) || 30;
    const days = Number(req.nextUrl.searchParams.get('days')) || 10;
    const slots = await getAvailableSlots({ durationMin: duration, days });
    return NextResponse.json({ slots });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/availability', err);
  }
}
