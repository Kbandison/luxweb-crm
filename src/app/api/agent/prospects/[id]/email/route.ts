import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { STUDIO } from '@/lib/brand';
import { getOutreachSettings } from '@/lib/queries/outreach';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import { AgentEmailSchema } from '@/lib/validation/agent-email';
import { gmailSender, sendGmailRaw } from '@/lib/google/gmail';
import { buildMime, toGmailRaw } from '@/lib/outreach/email-mime';
import { composeHtml, htmlToText, quoteHtml, replySubject } from '@/lib/outreach/email-body';
import {
  importableTouches,
  planTouch,
  referencesFor,
  statusRefusal,
  type SentEmail,
} from '@/lib/outreach/email-sequence';
import { importPrevious, loadSequence, markFailed, markSent, reserveSend } from '@/lib/outreach/email-record';
import type { ProspectStatus } from '@/lib/outreach/meta';

export const runtime = 'nodejs';

const refuse = (code: string, error: string, status = 409) =>
  Response.json({ error, code }, { status });

/**
 * POST /api/agent/prospects/[id]/email — send one outreach email (a first
 * email or a follow-up) from the owner's Gmail, so it goes out with its links
 * intact and lands in that mailbox's Sent folder. A follow-up goes into the
 * first email's thread as "Re: <subject>", with the earlier email quoted
 * under it the way Gmail quotes a reply.
 *
 * It records the email, not the touch: the caller still logs it with
 * /log once it has checked for a bounce, the same as an email sent any other
 * way. It refuses prospects who are done with us, and never sends a touch
 * twice.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'email');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const parsed = AgentEmailSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
    }
    const d = parsed.data;

    const { data: prospect } = await supabaseAdmin()
      .from('prospects')
      .select('status, email')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) return Response.json({ error: 'Not found' }, { status: 404 });
    const p = prospect as { status: ProspectStatus; email: string | null };

    const closed = statusRefusal(d.touch, p.status);
    if (closed) return refuse(closed.code, closed.error);

    const sender = await gmailSender(gate.ownerId);
    if (!sender.ok) return refuse('gmail_not_connected', sender.error);

    const plan = planTouch(d.touch, await loadSequence(id), Date.now());
    let parent: SentEmail | null;
    let retryId: string | null = null;
    if (plan.ok) {
      parent = plan.parent;
      retryId = plan.retry?.id ?? null;
    } else if (plan.code === 'no_earlier_email' && d.previous && importableTouches(d.touch).includes(d.previous.touch)) {
      parent = await importPrevious(id, { ...d.previous, to_email: (p.email ?? '').trim() });
    } else {
      return refuse(plan.code, plan.error);
    }

    // A reply goes to whoever the thread went to; a first email to the prospect.
    const to = (parent?.to_email ?? p.email ?? '').trim();
    if (!to) return refuse('no_email', 'This prospect has no email address.');

    const { slotTimezone } = await getOutreachSettings();
    const subject = parent ? replySubject(parent.subject) : (d.subject as string);
    const quote = parent?.sent_at
      ? quoteHtml(
          { html: parent.html, sentAt: new Date(parent.sent_at), fromName: STUDIO.name, fromEmail: sender.sender.email },
          slotTimezone,
        )
      : null;
    const html = composeHtml(d.html, quote);
    const domain = sender.sender.email.split('@')[1];
    const messageId = `<${randomUUID()}@${domain}>`;
    const references = parent ? referencesFor(parent) : null;

    const rowId = await reserveSend(
      id,
      d.touch,
      { to_email: to, subject, html, message_id: messageId, references_header: references },
      retryId,
    );
    if (!rowId) return refuse('in_progress', `A ${d.touch} send for this prospect is already in progress.`);

    const mime = buildMime({
      from: { name: STUDIO.name, email: sender.sender.email },
      to,
      subject,
      html,
      text: htmlToText(html),
      messageId,
      inReplyTo: parent?.message_id ?? null,
      references,
      date: new Date(),
      timeZone: slotTimezone,
    });
    const sent = await sendGmailRaw(gate.ownerId, toGmailRaw(mime), parent?.gmail_thread_id ?? null);

    if (!sent.ok) {
      // A request that died in flight may have gone out; leave the claim so
      // nothing re-sends it blind.
      if (!sent.unknown) await markFailed(rowId, sent.error);
      return refuse(sent.unknown ? 'unknown_result' : 'send_failed', sent.error, 502);
    }

    const sentAt = new Date().toISOString();
    const recorded = await markSent(rowId, sent, sentAt);
    await writeAudit({
      actor_id: gate.ownerId,
      action: 'send',
      entity_type: 'prospect',
      entity_id: id,
      diff: { outreach_email: d.touch, subject, gmail_thread_id: sent.threadId, ...VIA_AGENT },
    });

    return Response.json({
      ok: true,
      touch: d.touch,
      to,
      subject,
      sent_at: sentAt,
      gmail_message_id: sent.id,
      gmail_thread_id: sent.threadId,
      message_id: messageId,
      ...(recorded ? {} : { warning: 'Sent, but the CRM could not mark it sent. Do not resend.' }),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/prospects/[id]/email POST', err);
  }
}
