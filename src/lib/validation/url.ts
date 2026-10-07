const SCHEME = /^[a-z][a-z0-9+\-.]*:/i;

/**
 * A leading `host:port` ("example.com:8080", "localhost:3000/admin") — the
 * scheme regex reads "example.com:" as a scheme, but a colon followed only
 * by digits is a port. The host must be "localhost" or contain a dot, so a
 * real scheme name ("javascript:1/…") can never pass for a host.
 */
const BARE_HOST_PORT =
  /^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+(?:[/?#]|$)/i;

function hasExplicitScheme(s: string): boolean {
  return SCHEME.test(s) && !BARE_HOST_PORT.test(s);
}

/**
 * Accepts http: and https: URLs only. Anything else (javascript:, data:,
 * vbscript:, file:, ftp:, etc.) is rejected — these are XSS / exfiltration
 * vectors when rendered as <a href>. Null / undefined / empty string is
 * allowed (the field is optional in our schemas).
 *
 * Bare hostnames like "google.com" or "google.com:8080" are accepted by
 * virtually prepending "https://" before parsing — most users don't think
 * to type a protocol, and rejecting them produced a confusing "Invalid
 * payload" error. normalizeHttpUrl() (below) applies the same prefix when
 * persisting.
 */
export function isSafeHttpUrl(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed === '') return true;
  // Browsers strip tabs/newlines inside a URL, so "java\tscript:" would
  // parse as https://java… here yet run as javascript: from a raw href.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false;
  // If the input has an explicit scheme, parse it as-is (so we can still
  // reject javascript:/data:/file:/etc). Otherwise prepend https://.
  const candidate = hasExplicitScheme(trimmed) ? trimmed : `https://${trimmed}`;
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
  if (hasExplicitScheme(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const SFTP_HOST =
  /^(?:sftp:\/\/)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::(\d{1,5}))?(?:\/\S*)?$/i;

/**
 * An SFTP credential's host: "host", "host:port", or "sftp://host[:port]"
 * (optionally with a /path). Not a web URL — callers store it as typed and
 * never render it as a link. Null / undefined / empty is allowed, like
 * isSafeHttpUrl.
 */
export function isSftpHost(input: unknown): boolean {
  if (input == null) return true;
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed === '') return true;
  const m = SFTP_HOST.exec(trimmed);
  if (!m) return false;
  if (m[1] === undefined) return true;
  const port = Number(m[1]);
  return port >= 1 && port <= 65535;
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
