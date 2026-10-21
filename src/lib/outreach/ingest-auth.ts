import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Shared-key auth for the machine-to-machine endpoints, which are called by
 * the studio's other apps (ByteBoundless) and its assistant rather than a
 * browser.
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
 * Null when the request carries one of the keys in `envNames`; otherwise the
 * Response to return. 500 when none of those keys is configured at all.
 */
function requireOneOf(req: Request, envNames: string[]): Response | null {
  const expected = envNames
    .map((name) => process.env[name])
    .filter((v): v is string => Boolean(v));
  if (expected.length === 0) {
    return Response.json(
      { error: `${envNames.join(' or ')} not configured` },
      { status: 500 },
    );
  }
  const provided = providedKey(req);
  if (!provided || !expected.some((key) => keyMatches(provided, key))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * The lead push. Takes the ingest key or the agent key, so the assistant can
 * add prospects with the one secret it already holds.
 * Call it first in any route listed in proxy.ts's API_KEY_PATHS.
 */
export function requireIngestKey(req: Request): Response | null {
  return requireOneOf(req, ['OUTREACH_INGEST_KEY', 'AGENT_API_KEY']);
}

/**
 * The assistant's routes under /api/agent. Every one of them must call this
 * first: proxy.ts lets the whole prefix past the session gate.
 */
export function requireAgentKey(req: Request): Response | null {
  return requireOneOf(req, ['AGENT_API_KEY']);
}
