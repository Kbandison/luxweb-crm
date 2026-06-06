import 'server-only';
import { Resend } from 'resend';
import type { ReactElement } from 'react';

let _resend: Resend | null = null;

function client(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Missing RESEND_API_KEY');
  _resend = new Resend(key);
  return _resend;
}

/**
 * Recipient role decides which unsubscribe URL we ship in the
 * List-Unsubscribe header. Clients land on their portal email prefs;
 * admins land on the admin settings notifications tab. We don't have a
 * one-click endpoint yet — the URL just deep-links to the same toggles
 * the user already controls.
 */
export type EmailAudience = 'client' | 'admin';

function unsubscribeUrl(audience: EmailAudience): string | null {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return null;
  const path =
    audience === 'admin'
      ? '/admin/settings?tab=notifications&from=unsubscribe'
      : '/portal/profile?from=unsubscribe';
  return `${base}${path}`;
}

/**
 * Each email category sends from (and replies to) its own studio address,
 * rather than one catch-all. Addresses live in code because they're stable
 * brand identities on the verified luxwebstudio.dev domain:
 *   - receipt  billing/invoices/receipts (no-reply)
 *   - chat     message-thread notifications (reserved — no chat email yet)
 *   - update   client-facing project updates
 *   - admin    internal alerts sent to the studio owner
 */
export type EmailCategory = 'receipt' | 'chat' | 'update' | 'admin';

const STUDIO_NAME = 'LuxWeb Studio';

const FROM_BY_CATEGORY: Record<EmailCategory, string> = {
  receipt: 'no-reply@luxwebstudio.dev',
  chat: 'chat@luxwebstudio.dev',
  update: 'updates@luxwebstudio.dev',
  admin: 'alerts@luxwebstudio.dev',
};

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
  tag: string;
  category: EmailCategory;
}) {
  const from = FROM_BY_CATEGORY[opts.category];
  // Admin alerts deep-link the unsubscribe header to admin settings; all
  // other mail is client-facing.
  const audience: EmailAudience = opts.category === 'admin' ? 'admin' : 'client';
  // Replies route back to the same shared inbox (e.g. a reply to a project
  // update reaches updates@). Receipts come from no-reply@ and take no reply.
  const replyTo = opts.category === 'receipt' ? undefined : from;

  const unsub = unsubscribeUrl(audience);
  // Header keys are case-insensitive but Resend's typed `headers` requires
  // a flat string→string map. Build it conditionally so we don't ship a
  // List-Unsubscribe pointing at an empty origin in misconfigured dev.
  const headers: Record<string, string> = {};
  if (unsub) {
    headers['List-Unsubscribe'] = `<${unsub}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  return client().emails.send({
    from: `${STUDIO_NAME} <${from}>`,
    replyTo,
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
    tags: [{ name: 'type', value: opts.tag }],
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}
