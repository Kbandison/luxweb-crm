import 'server-only';
import { requireAgentKey } from '@/lib/outreach/ingest-auth';
import { getOwnerUserId } from '@/lib/queries/outreach';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

/**
 * The start of every /api/agent route: the key check (the only gate on that
 * prefix — see proxy.ts), then a rate limit, then the studio owner the
 * assistant acts as. Its writes are attributed to the owner, like anything
 * Kevin does from the admin side, and audited with `via: 'agent'`.
 *
 * Returns the owner's user id, or the Response to send back.
 */
export async function agentGate(
  req: Request,
  scope: string,
): Promise<{ ownerId: string } | Response> {
  const denied = requireAgentKey(req);
  if (denied) return denied;

  const limit = limitByKey(`agent/${scope}`, { capacity: 120, refillPerSec: 120 / 60 });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  const ownerId = await getOwnerUserId();
  if (!ownerId) {
    return Response.json({ error: 'No studio owner account found' }, { status: 500 });
  }
  return { ownerId };
}

/** Marker on every audit row the assistant writes. */
export const VIA_AGENT = { via: 'agent' } as const;
