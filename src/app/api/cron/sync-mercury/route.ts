import { syncMercury } from '@/lib/mercury/sync';
import { mercuryConfigured } from '@/lib/mercury/client';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Cron: mirror Mercury into the local banking tables overnight.
 *
 * Protected by CRON_SECRET, same as the other jobs. Returns ok with a skipped
 * flag when Mercury isn't configured, so a studio that hasn't connected a bank
 * doesn't produce a nightly failure.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!mercuryConfigured()) {
    return Response.json({ ok: true, skipped: 'MERCURY_API_TOKEN not set' });
  }

  try {
    const result = await syncMercury();
    await writeAudit({
      actor_id: null, // cron has no actor
      action: 'update',
      entity_type: 'bank_sync',
      diff: { ...result, source: 'cron' },
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
