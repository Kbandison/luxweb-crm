import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { accessTokenFor, GMAIL_SEND_SCOPE, hasScope } from '@/lib/google/oauth';

/**
 * Sending from the owner's own Gmail mailbox (the account connected on
 * /admin/outreach), for email that has to come from a person rather than the
 * studio's transactional sender: cold outreach and its follow-ups. A sent
 * message lands in that mailbox's Sent folder and in its thread, exactly as
 * if it were sent from Gmail itself, and replies and bounces come back there.
 */

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export type GmailSender = { email: string };

/** The connected mailbox, or why it can't send yet. */
export async function gmailSender(
  userId: string,
): Promise<{ ok: true; sender: GmailSender } | { ok: false; error: string }> {
  const { data } = await supabaseAdmin()
    .from('google_tokens')
    .select('connected_email, scope, refresh_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.refresh_token) {
    return { ok: false, error: 'Google isn’t connected. Connect it on /admin/outreach.' };
  }
  if (!hasScope(data.scope as string | null, GMAIL_SEND_SCOPE)) {
    return {
      ok: false,
      error: 'The Google connection can’t send email yet. Reconnect Google on /admin/outreach and allow sending.',
    };
  }
  const email = (data.connected_email as string | null)?.trim();
  if (!email) return { ok: false, error: 'The connected Google account has no email address on record. Reconnect it.' };
  return { ok: true, sender: { email } };
}

export type GmailSendResult =
  | { ok: true; id: string | null; threadId: string | null }
  /** `unknown`: the request died in flight, so it may or may not have gone out. */
  | { ok: false; status: number; error: string; unknown?: boolean };

/** Send a finished RFC 5322 message (base64url `raw`), in `threadId` when it's a reply. */
export async function sendGmailRaw(
  userId: string,
  raw: string,
  threadId: string | null,
): Promise<GmailSendResult> {
  let token: string | null;
  try {
    token = await accessTokenFor(userId);
  } catch (err) {
    return { ok: false, status: 401, error: `Google sign-in failed: ${String(err)}` };
  }
  if (!token) return { ok: false, status: 401, error: 'Google isn’t connected.' };

  let res: Response;
  try {
    res = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
  } catch (err) {
    return { ok: false, status: 502, error: `No answer from Gmail: ${String(err)}`, unknown: true };
  }
  if (!res.ok) {
    let message = `Gmail answered ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = `${message}: ${body.error.message}`;
    } catch {
      /* keep the status line */
    }
    return { ok: false, status: res.status, error: message };
  }
  // Accepted means sent, even if the body can't be read.
  const body = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string };
  return { ok: true, id: body.id ?? null, threadId: body.threadId ?? null };
}
