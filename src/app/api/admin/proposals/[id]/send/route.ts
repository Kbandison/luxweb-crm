import { requireCapability } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { sendPortalInvite } from '@/lib/invites';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/proposals/[id]/send
 * Transitions a draft to 'sent', stamps sent_at, and emails the client
 * (via notify()) if they have portal access + email prefs allow.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]/send:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const { data: before } = await supabaseAdmin()
      .from('proposals')
      .select('status, title, total_cents, contact_id, project_id')
      .eq('id', id)
      .single();

    if (!before) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if ((before.status as string) !== 'draft') {
      return Response.json(
        { error: `Proposal is already ${before.status}.` },
        { status: 409 },
      );
    }

    const sentAt = new Date().toISOString();
    const { error } = await supabaseAdmin()
      .from('proposals')
      .update({ status: 'sent', sent_at: sentAt })
      .eq('id', id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'send',
      entity_type: 'proposal',
      entity_id: id,
      diff: { status: { from: 'draft', to: 'sent' }, sent_at: sentAt },
    });

    const projectId = before.project_id as string | null;
    if (projectId) revalidateProject(projectId);

    // Notify the client. If they already have portal access, send the
    // "proposal ready" email. If they don't, auto-invite them instead — the
    // invite lands them in the portal where the proposal is the focus card,
    // closing the gap where a sent proposal went unseen because the client
    // was never invited. Best-effort: a failed invite won't fail the send.
    const contactId = before.contact_id as string | null;
    if (contactId) {
      const clientUserId = await getContactUserId(contactId);
      if (clientUserId) {
        await notify({
          type: 'proposal_sent',
          userId: clientUserId,
          proposalId: id,
          title: before.title as string,
          totalCents:
            before.total_cents == null ? null : Number(before.total_cents),
          proposalPath: `/portal/proposals/${id}`,
        });
      } else {
        const origin =
          req.headers.get('origin') ??
          process.env.NEXT_PUBLIC_APP_URL ??
          'http://localhost:3000';
        const invite = await sendPortalInvite({
          contactId,
          origin,
          actorId: session.userId,
        });
        if (!invite.ok) {
          console.warn(
            `[proposal send] auto-invite failed for contact=${contactId}: ${invite.error}`,
          );
        }
      }
    }

    return Response.json({ ok: true, sent_at: sentAt });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
