/**
 * Accepts http: and https: URLs only. Anything else (javascript:, data:,
 * vbscript:, file:, ftp:, etc.) is rejected — these are XSS / exfiltration
 * vectors when rendered as <a href>. Null / undefined / empty string is
 * allowed (the field is optional in our schemas).
 *
 * Bare hostnames like "google.com" are accepted by virtually prepending
 * "https://" before parsing — most users don't think to type a protocol,
 * and rejecting them produced a confusing "Invalid payload" error.
 * normalizeHttpUrl() (below) applies the same prefix when persisting.
 */
export function isSafeHttpUrl(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed === '') return true;
  // If the input has an explicit scheme, parse it as-is (so we can still
  // reject javascript:/data:/file:/etc). Otherwise prepend https://.
  const candidate = /^[a-z][a-z0-9+\-.]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Return the URL in canonical http(s) form for persistence. Mirrors
 * isSafeHttpUrl's protocol-prepend so the stored value is always a
 * working absolute URL (or empty when input was empty / null).
 * Does NOT validate — call isSafeHttpUrl first.
 */
export function normalizeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Restrict an open-redirect "next" param to same-origin path-only redirects.
 * Returns a path relative to origin (e.g. "/portal/dashboard?x=1") or "/" if
 * the input would escape the current origin in any form. Defends against:
 *
 *   next=//evil.com           → "/"
 *   next=https://evil.com     → "/"
 *   next=/\\evil.com          → "/"
 *   next=javascript:alert(1)  → "/"
 *   next=/portal/dashboard    → "/portal/dashboard"
 */
export function safeSameOriginNext(
  raw: string | null | undefined,
  origin: string,
): string {
  if (!raw) return '/';
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin) return '/';
    return `${u.pathname}${u.search}${u.hash}` || '/';
  } catch {
    return '/';
  }
}
