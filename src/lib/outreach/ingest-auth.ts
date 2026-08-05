import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Shared-key auth for the machine-to-machine outreach endpoints, which are
 * called by the studio's other apps (ByteBoundless) rather than a browser.
 *
 * These routes are exempt from the session gate in proxy.ts, so this check is
 * the only thing standing in front of them — it fails closed when the key
 * isn't configured.
 */

function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — check first, and still compare
  // so an attacker learns nothing from response timing on a same-length guess.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Bearer token, or the x-api-key header for callers that prefer it. */
function providedKey(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-api-key');
}

/**
 * Null when the caller is authorized; otherwise the Response to return.
 * Call it first in any route listed in proxy.ts's API_KEY_PATHS.
 */
export function requireIngestKey(req: Request): Response | null {
  const expected = process.env.OUTREACH_INGEST_KEY;
  if (!expected) {
    return Response.json(
      { error: 'OUTREACH_INGEST_KEY not configured' },
      { status: 500 },
    );
  }
  const provided = providedKey(req);
  if (!provided || !keyMatches(provided, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
