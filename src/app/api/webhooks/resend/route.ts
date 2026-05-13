import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Resend bounce / complaint tracking.
 *
 * Resend ships webhooks via Svix. We require the `RESEND_WEBHOOK_SECRET`
 * env var (whsec_*) and verify svix headers + HMAC-SHA256 signature before
 * trusting the payload. Replay window is 5 minutes.
 *
 * Without verification, an unauthenticated attacker could POST a forged
 * "email.bounced" event for any address and silently zero out that user's
 * email_prefs — effectively disabling their account notifications.
 */

const REPLAY_WINDOW_SECONDS = 5 * 60;

function verifySvix(
  rawBody: string,
  headers: Headers,
  secretFull: string,
): boolean {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !timestamp || !sigHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > REPLAY_WINDOW_SECONDS) return false;

  // svix secrets are formatted as "whsec_<base64-key>"
  const prefix = 'whsec_';
  if (!secretFull.startsWith(prefix)) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secretFull.slice(prefix.length), 'base64');
  } catch {
    return false;
  }

  const toSign = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(toSign).digest('base64');

  // Header may contain multiple "v1,<sig>" pairs space-separated.
  const tokens = sigHeader.split(' ').filter(Boolean);
  for (const t of tokens) {
    const [, sig] = t.split(',');
    if (!sig) continue;
    if (sig.length !== expected.length) continue;
    if (
      timingSafeEqual(
        Buffer.from(sig, 'utf8'),
        Buffer.from(expected, 'utf8'),
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed — we never want an unsecured payload to reach the
    // email_prefs update below.
    return Response.json(
      { error: 'Webhook secret not configured' },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  if (!verifySvix(rawBody, req.headers, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: { to?: string | string[] } } = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = event.type;
  if (type !== 'email.bounced' && type !== 'email.complained') {
    return Response.json({ received: true, ignored: true });
  }

  const emails = Array.isArray(event.data?.to)
    ? event.data.to
    : event.data?.to
      ? [event.data.to]
      : [];

  if (emails.length === 0) {
    return Response.json({ received: true, no_match: true });
  }

  try {
    const disabled = {
      message: false,
      invoice_sent: false,
      invoice_paid: false,
      proposal_sent: false,
      milestone_updated: false,
    };
    await supabaseAdmin()
      .from('users')
      .update({ email_prefs: disabled })
      .in('email', emails);
  } catch (err) {
    console.warn('[resend webhook] disable email_prefs failed:', err);
  }

  return Response.json({ received: true });
}
