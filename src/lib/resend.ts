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

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
  tag: string;
  /** Defaults to 'client' — most transactional mail lands client-side. */
  audience?: EmailAudience;
}) {
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.RESEND_REPLY_TO;
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL');

  const audience = opts.audience ?? 'client';
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
    from: `LuxWeb Studio <${from}>`,
    replyTo,
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
    tags: [{ name: 'type', value: opts.tag }],
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}
