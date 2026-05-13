/**
 * Accepts http: and https: URLs only. Anything else (javascript:, data:,
 * vbscript:, file:, ftp:, etc.) is rejected — these are XSS / exfiltration
 * vectors when rendered as <a href>. Null / undefined / empty string is
 * allowed (the field is optional in our schemas).
 */
export function isSafeHttpUrl(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed === '') return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
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
