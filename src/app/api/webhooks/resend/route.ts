import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Resend bounce / complaint tracking.
 *
 * Clears `email_prefs` (sets every key to false) on the matching crm.users
 * row so we stop emailing addresses that bounced or flagged us as spam.
 *
 * Resend currently verifies webhooks via IP allowlist rather than a shared
 * signing secret. When they ship signature verification, replace the body
 * parse with a `svix`/HMAC check before trusting the payload.
 */
export async function POST(req: Request) {
  let event: { type?: string; data?: { to?: string | string[] } } = {};
  try {
    event = await req.json();
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
