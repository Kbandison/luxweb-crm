import { NextResponse, type NextRequest } from 'next/server';
import { getAvailableSlots } from '@/lib/outreach/availability';
import { getOutreachSettings } from '@/lib/queries/outreach';
import { safeError } from '@/lib/safe-error';
import { agentGate } from '@/lib/outreach/agent-gate';

export const runtime = 'nodejs';

/**
 * GET /api/agent/availability?duration=30&days=10 — open slots on the owner's
 * calendar, exactly what a setter's booking drawer offers (business hours
 * from outreach settings, minus busy times on Kevin's Google Calendar, at
 * least an hour out). Offer the assistant's invitees times from this list.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await agentGate(req, 'availability');
    if (gate instanceof Response) return gate;

    const duration = Number(req.nextUrl.searchParams.get('duration')) || 30;
    const days = Number(req.nextUrl.searchParams.get('days')) || 10;
    const [slots, settings] = await Promise.all([
      getAvailableSlots({ durationMin: duration, days }),
      getOutreachSettings(),
    ]);
    return NextResponse.json({ timezone: settings.slotTimezone, slots });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/availability', err);
  }
}
