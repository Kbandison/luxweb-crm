/** The live portal. */
const PRODUCTION_URL = 'https://portal.luxwebstudio.dev';

/**
 * The portal's base URL for links that leave the app — emails above all,
 * where a bare "/portal/…" path can't be opened. NEXT_PUBLIC_APP_URL
 * overrides it. Without that, a Vercel preview links to itself, and any
 * other production build to the live portal: the variable was never set in
 * production, so every emailed portal link went out as a bare path. Empty
 * in local dev without the variable.
 */
export function appBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === 'production') return PRODUCTION_URL;
  return '';
}
