import 'server-only';

/**
 * One HTTP layer for every Mercury call.
 *
 * `client.ts` and `payments.ts` each grew their own copy of the base URL,
 * token resolution, and fetch wrapper. Two copies of the code that attaches a
 * banking credential is one too many — a fix to error handling or auth in one
 * would silently miss the other.
 */

const BASE_URL = 'https://api.mercury.com/api/v1';

/**
 * 'read' → the read-only token.
 * 'write' → a dedicated write token if one exists, else the read token.
 *
 * The fallback is deliberate: `request-send-money` is approval-gated and works
 * on a read-only token, so payouts need no write credential. See payments.ts.
 */
export type TokenMode = 'read' | 'write';

export function mercuryToken(mode: TokenMode = 'read'): string {
  const t =
    mode === 'write'
      ? process.env.MERCURY_WRITE_TOKEN || process.env.MERCURY_API_TOKEN
      : process.env.MERCURY_API_TOKEN;
  if (!t) throw new Error('MERCURY_API_TOKEN is not configured');
  return t;
}

export function mercuryConfigured(): boolean {
  return !!process.env.MERCURY_API_TOKEN;
}

/** Mercury reports money as dollars with 2dp; we store integer cents. */
export function toCents(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  // Round after scaling — 19.99 * 100 is 1998.9999… in binary floating point.
  return Math.round(amount * 100);
}

export async function mercuryFetch<T>(
  path: string,
  opts: {
    mode?: TokenMode;
    method?: 'GET' | 'POST';
    params?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${mercuryToken(opts.mode)}`,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    // Banking data is never served from a cache.
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Path only — never the token or the full URL with query params.
    throw new Error(
      `Mercury ${path} failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
    );
  }
  return (await res.json()) as T;
}
