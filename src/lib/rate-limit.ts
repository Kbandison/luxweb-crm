/**
 * Tiny in-memory token bucket. Adequate for the request volume this app
 * sees and free of any external dep. Resets across deploys (which is
 * fine — short windows here, not security-critical).
 *
 * State lives in module scope so it persists across requests on the same
 * runtime instance. Multi-region / multi-instance deploys lose isolation
 * but the worst-case is the limit being 2x higher than declared, which
 * is acceptable for the surfaces we apply this to.
 */

export type BucketOpts = {
  /** Max tokens the bucket can hold (and the initial fill). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
};

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

type BucketState = {
  tokens: number;
  /** ms since epoch of the last refill. */
  updatedAt: number;
};

const BUCKETS = new Map<string, BucketState>();

// Cleanup runs lazily — we don't want a timer holding the process open.
// We drop buckets that have been fully refilled and untouched for a while.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function maybeSweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, b] of BUCKETS) {
    // A bucket older than 10 minutes with full tokens is dead state.
    if (now - b.updatedAt > 10 * 60_000) {
      BUCKETS.delete(key);
    }
  }
}

export function limitByKey(key: string, opts: BucketOpts): LimitResult {
  const now = Date.now();
  maybeSweep(now);

  const existing = BUCKETS.get(key);
  let tokens: number;
  if (!existing) {
    tokens = opts.capacity;
  } else {
    const elapsedSec = (now - existing.updatedAt) / 1000;
    tokens = Math.min(
      opts.capacity,
      existing.tokens + elapsedSec * opts.refillPerSec,
    );
  }

  if (tokens >= 1) {
    BUCKETS.set(key, { tokens: tokens - 1, updatedAt: now });
    return { ok: true };
  }

  // Not enough tokens — compute how long until we have one.
  const needed = 1 - tokens;
  const retryAfterSec = Math.ceil(needed / opts.refillPerSec);
  BUCKETS.set(key, { tokens, updatedAt: now });
  return { ok: false, retryAfterSec };
}

/**
 * Build a 429 Response with a Retry-After header. Pass extra headers
 * through (e.g. CORS) so the caller's existing header set is preserved.
 */
export function rateLimitResponse(
  retryAfterSec: number,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('Retry-After', String(retryAfterSec));
  headers.set('Content-Type', 'application/json');
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfterSec,
    }),
    { status: 429, headers },
  );
}

/**
 * Best-effort client IP. Falls back to a fixed sentinel so we still
 * rate-limit unknown sources rather than letting them through.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/** Test-only: clear the bucket map. Imported only by tests. */
export function __resetRateLimitForTests(): void {
  BUCKETS.clear();
  lastSweep = 0;
}
