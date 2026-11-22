import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { bracketMessageId } from '@/lib/outreach/email-mime';
import type { SentEmail, Touch } from '@/lib/outreach/email-sequence';

/**
 * `crm.outreach_emails`: one row per outreach email, written before the send
 * (status 'sending') so two calls can't both send the same touch, then marked
 * 'sent' or 'failed'. The stored HTML is exactly what went out, quote and
 * all, so the next follow-up can quote it in turn.
 */

const COLUMNS =
  'id, touch, status, to_email, subject, html, message_id, references_header, gmail_thread_id, sent_at, updated_at';

export async function loadSequence(prospectId: string): Promise<SentEmail[]> {
  const { data, error } = await supabaseAdmin()
    .from('outreach_emails')
    .select(COLUMNS)
    .eq('prospect_id', prospectId);
  if (error) throw new Error(`outreach_emails read failed: ${error.message}`);
  return (data ?? []) as SentEmail[];
}

/** Record an earlier email that went out from Gmail itself, so a follow-up can answer it. */
export async function importPrevious(
  prospectId: string,
  p: {
    touch: Touch;
    to_email: string;
    subject: string;
    html: string;
    message_id: string;
    references?: string | null;
    gmail_thread_id: string;
    sent_at: string;
  },
): Promise<SentEmail> {
  const { data, error } = await supabaseAdmin()
    .from('outreach_emails')
    .insert({
      prospect_id: prospectId,
      touch: p.touch,
      status: 'sent',
      source: 'imported',
      to_email: p.to_email,
      subject: p.subject,
      html: p.html,
      message_id: bracketMessageId(p.message_id),
      references_header: p.references?.trim() || null,
      gmail_thread_id: p.gmail_thread_id,
      sent_at: new Date(p.sent_at).toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`outreach_emails import failed: ${error.message}`);
  return data as SentEmail;
}

export type Reservation = {
  to_email: string;
  subject: string;
  html: string;
  message_id: string;
  references_header: string | null;
};

/**
 * Claim the touch before sending. Returns the row id, or null when another
 * call claimed it first (the unique (prospect_id, touch) index said no).
 */
export async function reserveSend(
  prospectId: string,
  touch: Touch,
  r: Reservation,
  retryId: string | null,
): Promise<string | null> {
  const sb = supabaseAdmin();
  if (retryId) {
    // Only a failed attempt may be taken over; the status filter makes the
    // claim atomic against a second retry.
    const { data, error } = await sb
      .from('outreach_emails')
      .update({ ...r, status: 'sending', error: null })
      .eq('id', retryId)
      .eq('status', 'failed')
      .select('id');
    if (error) throw new Error(`outreach_emails retry failed: ${error.message}`);
    return data && data.length > 0 ? retryId : null;
  }
  const { data, error } = await sb
    .from('outreach_emails')
    .insert({ prospect_id: prospectId, touch, status: 'sending', source: 'crm', ...r })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`outreach_emails insert failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function markSent(
  rowId: string,
  gmail: { id: string | null; threadId: string | null },
  sentAt: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('outreach_emails')
    .update({
      status: 'sent',
      gmail_message_id: gmail.id,
      gmail_thread_id: gmail.threadId,
      sent_at: sentAt,
    })
    .eq('id', rowId);
  return !error;
}

export async function markFailed(rowId: string, message: string): Promise<void> {
  await supabaseAdmin()
    .from('outreach_emails')
    .update({ status: 'failed', error: message.slice(0, 2000) })
    .eq('id', rowId);
}
