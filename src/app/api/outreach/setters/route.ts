import { supabaseAdmin } from '@/lib/supabase/admin';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { requireIngestKey } from '@/lib/outreach/ingest-auth';
import { resolveSetterNames } from '@/lib/queries/outreach';
import { ROLE_LABELS, hasCapability, type Role } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

/**
 * GET /api/outreach/setters — who a pushed lead can be assigned to.
 *
 * Lets the lead-finding tool offer an "assign to" picker at push time instead
 * of dumping everything on the sender's list. Same shared key as the ingest
 * endpoint. Returns only what a picker needs — no ids, no anything else about
 * the account.
 */
export async function GET(req: Request) {
  try {
    const denied = requireIngestKey(req);
    if (denied) return denied;

    const limit = limitByKey('outreach/setters', { capacity: 60, refillPerSec: 1 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const { data } = await supabaseAdmin()
      .from('users')
      .select('id, email, role')
      .order('created_at', { ascending: true });

    const rows = ((data ?? []) as { id: string; email: string; role: Role }[]).filter(
      (u) => hasCapability(u.role, 'manage_outreach'),
    );
    const names = await resolveSetterNames(rows.map((r) => r.id));

    return Response.json({
      setters: rows.map((u) => ({
        email: u.email,
        name: names.get(u.id) ?? u.email,
        role: ROLE_LABELS[u.role] ?? u.role,
        // The picker defaults to a real setter over the owner when there is one.
        isSetter: u.role === 'setter',
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/setters', err);
  }
}
