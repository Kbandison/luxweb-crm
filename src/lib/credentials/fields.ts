import type { CredentialKind } from '@/lib/types/credential';
import {
  isSafeHttpUrl,
  isSftpHost,
  normalizeHttpUrl,
} from '@/lib/validation/url';

/**
 * Which optional fields each credential kind uses — mirrors fieldsFor() in
 * the admin and client credential forms. Routes drop the rest: switching the
 * type in a form hides inputs but still sends whatever was typed in them.
 */
export const CREDENTIAL_KIND_FIELDS: Record<
  CredentialKind,
  { username: boolean; url: boolean; secret: boolean; notes: boolean }
> = {
  password: { username: true, url: true, secret: true, notes: true },
  api_key: { username: false, url: true, secret: true, notes: true },
  url: { username: false, url: true, secret: false, notes: true },
  sftp: { username: true, url: true, secret: true, notes: true },
  note: { username: false, url: false, secret: true, notes: false },
};

/**
 * Validation message for a credential's url column, or null when it's fine.
 * SFTP stores a host[:port], everything else an http(s) link.
 */
export function credentialUrlError(
  kind: CredentialKind,
  url: string | null | undefined,
): string | null {
  if (kind === 'sftp') {
    return isSftpHost(url)
      ? null
      : 'Host must look like sftp.example.com or sftp.example.com:22';
  }
  return isSafeHttpUrl(url) ? null : 'URL must use http or https';
}

/**
 * The url as stored. SFTP hosts are kept as typed (they aren't web links);
 * anything else gets https:// on a bare host, so "app.host.com/login"
 * renders as a working link instead of a relative one. Null for kinds that
 * don't use a url. Call credentialUrlError first.
 */
export function normalizeCredentialUrl(
  kind: CredentialKind,
  url: string | null | undefined,
): string | null {
  if (!CREDENTIAL_KIND_FIELDS[kind].url) return null;
  if (kind === 'sftp') return url?.trim() || null;
  return normalizeHttpUrl(url);
}

/**
 * The href to render a stored credential url with, or null when it must
 * stay plain text — SFTP hosts, and anything (older rows included) that
 * isn't a safe http(s) link.
 */
export function credentialHref(
  kind: CredentialKind,
  url: string | null,
): string | null {
  if (!url || kind === 'sftp' || !isSafeHttpUrl(url)) return null;
  return normalizeHttpUrl(url);
}
