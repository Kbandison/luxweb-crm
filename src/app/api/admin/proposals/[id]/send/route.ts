import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * POST /api/admin/proposals/[id]/send
 * Transitions a draft to 'sent', stamps sent_at, and emails the client
 * (via notify()) if they have portal access + email prefs allow.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const { data: before } = await supabaseAdmin()
      .from('proposals')
      .select('status, title, total_cents, contact_id')
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

    // Notify the client (if invited to the portal + not opted out).
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
      }
    }

    return Response.json({ ok: true, sent_at: sentAt });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
