import { z } from 'zod';
import { TOUCHES } from '@/lib/outreach/email-sequence';

/**
 * POST /api/agent/prospects/{id}/email — one outreach email, sent from the
 * owner's Gmail. The caller writes the body (greeting through footer); the
 * CRM adds the subject line for replies, the quote of the earlier email, and
 * the headers that thread it.
 */

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: 'must be a single line' });

const messageId = oneLine(500).refine((s) => /^<?[^<>\s@]+@[^<>\s@]+>?$/.test(s), {
  message: 'must look like <id@host>',
});

/** An earlier email in the thread that went out from Gmail, not the CRM. */
const PreviousEmail = z.object({
  touch: z.enum(['first', 'follow_up_1']),
  gmail_thread_id: oneLine(100),
  /** Its Message-ID header. */
  message_id: messageId,
  /** Its own References header, if it had one (a follow-up does). */
  references: z.string().trim().max(4000).refine((s) => !/[\r\n]/.test(s)).optional().nullable(),
  subject: oneLine(300),
  html: z.string().min(1).max(200_000),
  sent_at: z.string().datetime({ offset: true }),
});

export const AgentEmailSchema = z
  .object({
    touch: z.enum(TOUCHES),
    /** First email only; a follow-up is always "Re: <first email's subject>". */
    subject: oneLine(300).optional(),
    /** The body as HTML: greeting, paragraphs, signature, footer. */
    html: z.string().min(1).max(100_000),
    previous: PreviousEmail.optional(),
  })
  .refine((d) => d.touch !== 'first' || Boolean(d.subject), {
    message: 'A first email needs a subject',
    path: ['subject'],
  })
  .refine((d) => d.touch === 'first' || !d.subject, {
    message: 'A follow-up takes the first email’s subject; leave subject out',
    path: ['subject'],
  })
  .refine((d) => d.touch !== 'first' || !d.previous, {
    message: 'A first email has no previous email',
    path: ['previous'],
  });

export type AgentEmailInput = z.infer<typeof AgentEmailSchema>;
