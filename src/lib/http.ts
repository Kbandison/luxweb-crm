/**
 * Tiny client-side fetch wrapper.
 *
 * The shape used by ~55 components in this repo is identical:
 *
 *     const res = await fetch('/api/...', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(payload),
 *     });
 *     if (!res.ok) {
 *       const j = await res.json().catch(() => ({}));
 *       toast.error(j.error ?? 'Something went wrong');
 *       return;
 *     }
 *     const data = await res.json();
 *
 * `postJson` collapses that to one call. Returns a discriminated result
 * so callers don't have to remember to check both `res.ok` and parse
 * fallbacks. Migration is incremental — existing fetch sites stay
 * functional; new code should default to this helper.
 */

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export async function postJson<T = unknown>(
  url: string,
  body?: unknown,
  opts?: { method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; signal?: AbortSignal },
): Promise<JsonResult<T>> {
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method: opts?.method ?? 'POST',
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal: opts?.signal,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      error: j.error ?? `Request failed (${res.status})`,
      status: res.status,
    };
  }
  // 204 No Content + non-JSON responses → return undefined as T.
  const text = await res.text();
  if (!text) return { ok: true, data: undefined as T };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: 'Invalid response JSON', status: res.status };
  }
}

/** Sugar for the common DELETE-with-no-body case. */
export function deleteJson<T = unknown>(
  url: string,
  opts?: { signal?: AbortSignal },
): Promise<JsonResult<T>> {
  return postJson<T>(url, undefined, { method: 'DELETE', signal: opts?.signal });
}

/** Sugar for the common PATCH-with-body case. */
export function patchJson<T = unknown>(
  url: string,
  body: unknown,
  opts?: { signal?: AbortSignal },
): Promise<JsonResult<T>> {
  return postJson<T>(url, body, { method: 'PATCH', signal: opts?.signal });
}
