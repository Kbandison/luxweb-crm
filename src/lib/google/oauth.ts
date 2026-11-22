import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  encryptSecret,
  decryptSecret,
  type EncryptedSecret,
} from '@/lib/credentials/crypto';

/**
 * The owner's Google connection: one OAuth consent that covers the calendar
 * (booked calls) and Gmail sending (outreach email from the owner's own
 * mailbox). Tokens are AES-GCM encrypted at rest (reusing
 * CREDS_ENCRYPTION_KEY). No googleapis SDK — plain fetch against the REST API.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** Holds the consent request's `state` until Google sends the owner back. */
export const OAUTH_STATE_COOKIE = 'google_oauth_state';

const SCOPES = [
  // The address the connection sends from; without it userinfo returns none.
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  GMAIL_SEND_SCOPE,
].join(' ');

function clientId() {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error('GOOGLE_CLIENT_ID is not set');
  return v;
}
function clientSecret() {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error('GOOGLE_CLIENT_SECRET is not set');
  return v;
}
export function googleRedirectUri(origin: string) {
  return `${origin}/api/admin/google/callback`;
}
export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Consent URL — offline access so we get a refresh token. */
export function getAuthUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(origin),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

/** Whether a space-separated grant includes `scope`. */
export function hasScope(granted: string | null | undefined, scope: string): boolean {
  return (granted ?? '').split(/\s+/).includes(scope);
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw new Error(`Google token error ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

const pack = (s: string) => JSON.stringify(encryptSecret(s));
const unpack = (s: string | null) =>
  s ? decryptSecret(JSON.parse(s) as EncryptedSecret) : null;

/** Exchange an auth code and persist the connection for `userId`. */
export async function connectFromCode(
  userId: string,
  code: string,
  origin: string,
): Promise<void> {
  const tok = await tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: googleRedirectUri(origin),
    grant_type: 'authorization_code',
  });
  if (!tok.refresh_token) {
    // Google only returns a refresh_token on first consent; prompt=consent
    // forces it, but guard anyway.
    throw new Error('No refresh token returned — reconnect with consent.');
  }
  const expiry = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  let email: string | null = null;
  try {
    const u = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (u.ok) email = ((await u.json()) as { email?: string }).email ?? null;
  } catch {
    /* email is best-effort */
  }
  await supabaseAdmin().from('google_tokens').upsert({
    user_id: userId,
    refresh_token: pack(tok.refresh_token),
    access_token: pack(tok.access_token),
    token_expiry: expiry,
    scope: tok.scope ?? SCOPES,
    connected_email: email,
    updated_at: new Date().toISOString(),
  });
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await supabaseAdmin().from('google_tokens').delete().eq('user_id', userId);
}

export type GoogleConnection = {
  connected: boolean;
  email: string | null;
  /** The grant includes Gmail sending (older connections are calendar-only). */
  canSendEmail: boolean;
};

export async function getGoogleConnection(userId: string): Promise<GoogleConnection> {
  try {
    const { data } = await supabaseAdmin()
      .from('google_tokens')
      .select('connected_email, refresh_token, scope')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data?.refresh_token) return { connected: false, email: null, canSendEmail: false };
    return {
      connected: true,
      email: (data.connected_email as string | null) ?? null,
      canSendEmail: hasScope(data.scope as string | null, GMAIL_SEND_SCOPE),
    };
  } catch {
    return { connected: false, email: null, canSendEmail: false };
  }
}

/** A fresh access token for `userId`, refreshing via the stored refresh token. */
export async function accessTokenFor(userId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('google_tokens')
    .select('refresh_token, access_token, token_expiry')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.refresh_token) return null;

  const expiry = data.token_expiry ? new Date(data.token_expiry as string).getTime() : 0;
  if (data.access_token && expiry > Date.now()) {
    return unpack(data.access_token as string);
  }
  const refresh = unpack(data.refresh_token as string);
  if (!refresh) return null;
  const tok = await tokenRequest({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  const newExpiry = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();
  await sb
    .from('google_tokens')
    .update({ access_token: pack(tok.access_token), token_expiry: newExpiry })
    .eq('user_id', userId);
  return tok.access_token;
}
