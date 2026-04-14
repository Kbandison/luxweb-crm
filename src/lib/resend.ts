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

export async function sendEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
  tag: string;
}) {
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.RESEND_REPLY_TO;
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL');
  return client().emails.send({
    from: `LuxWeb Studio <${from}>`,
    replyTo,
    to: opts.to,
    subject: opts.subject,
    react: opts.react,
    tags: [{ name: 'type', value: opts.tag }],
  });
}
