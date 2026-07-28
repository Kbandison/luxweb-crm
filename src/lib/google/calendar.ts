import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  encryptSecret,
  decryptSecret,
  type EncryptedSecret,
} from '@/lib/credentials/crypto';

/**
 * Minimal Google Calendar integration for the outreach module. The owner
 * connects their calendar once (OAuth); booked appointments are written to it
 * and the prospect is invited. Tokens are AES-GCM encrypted at rest (reusing
 * CREDS_ENCRYPTION_KEY). No googleapis SDK — plain fetch against the REST API.
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
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

export type GoogleConnection = { connected: boolean; email: string | null };

export async function getGoogleConnection(userId: string): Promise<GoogleConnection> {
  try {
    const { data } = await supabaseAdmin()
      .from('google_tokens')
      .select('connected_email, refresh_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data?.refresh_token) return { connected: false, email: null };
    return { connected: true, email: (data.connected_email as string | null) ?? null };
  } catch {
    return { connected: false, email: null };
  }
}

/** A fresh access token for `userId`, refreshing via the stored refresh token. */
async function accessTokenFor(userId: string): Promise<string | null> {
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

export type CalendarEventInput = {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmail?: string | null;
};

/**
 * Create an event on `userId`'s primary calendar. Returns the event id, or
 * null if they aren't connected / the call fails (booking still succeeds
 * locally — the calendar is a sync target, not the source of truth).
 */
export async function createCalendarEvent(
  userId: string,
  ev: CalendarEventInput,
): Promise<string | null> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return null;
    const body: Record<string, unknown> = {
      summary: ev.summary,
      description: ev.description,
      start: { dateTime: ev.startIso },
      end: { dateTime: ev.endIso },
    };
    if (ev.attendeeEmail) body.attendees = [{ email: ev.attendeeEmail }];
    const res = await fetch(
      `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.warn('[google] create event failed:', res.status, await res.text());
      return null;
    }
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch (err) {
    console.warn('[google] create event error:', err);
    return null;
  }
}

export type BusyInterval = { start: number; end: number };

/**
 * Busy intervals on `userId`'s primary calendar in [timeMin, timeMax].
 * Returns [] when they aren't connected or the call fails (callers then treat
 * every business-hour slot as open).
 */
export async function freeBusy(
  userId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return [];
    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        items: [{ id: 'primary' }],
      }),
    });
    if (!res.ok) {
      console.warn('[google] freeBusy failed:', res.status);
      return [];
    }
    const data = (await res.json()) as {
      calendars?: { primary?: { busy?: { start: string; end: string }[] } };
    };
    const busy = data.calendars?.primary?.busy ?? [];
    return busy.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));
  } catch (err) {
    console.warn('[google] freeBusy error:', err);
    return [];
  }
}

/** Delete a previously-created event (best-effort). */
export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return;
    await fetch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    console.warn('[google] delete event error:', err);
  }
}
