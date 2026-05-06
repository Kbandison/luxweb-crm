import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Flip a sent proposal back to draft so it can be edited and re-sent.
 * Industry-standard "Revise & Resend" pattern — preserves an audit-log
 * snapshot of the prior content so we can prove what was sent originally
 * if it ever comes up.
 *
 * Allowed transitions:
 *   sent → draft (revision counter bumps)
 *
 * Refused for any other status — accepted / rejected / expired all stay
 * locked. (Use a fresh proposal for a new bid against the same contact.)
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: before } = await sb
      .from('proposals')
      .select('id, status, title, content_json, revision, sent_at')
      .eq('id', id)
      .single();

    if (!before) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if ((before.status as string) !== 'sent') {
      return Response.json(
        {
          error: `Proposal is ${before.status}; only sent proposals can be revised.`,
        },
        { status: 409 },
      );
    }

    const prevRevision = (before.revision as number | null) ?? 1;
    const nextRevision = prevRevision + 1;

    // Snapshot the content the client saw under that revision so we can
    // always reconstruct what was on the table at any prior send.
    await writeAudit({
      actor_id: session.userId,
      action: 'snapshot',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        revision: prevRevision,
        title: before.title,
        content: before.content_json,
        previously_sent_at: before.sent_at,
      },
    });

    const { error } = await sb
      .from('proposals')
      .update({
        status: 'draft',
        revision: nextRevision,
        // Clear sent_at so the next Send writes a fresh timestamp.
        sent_at: null,
      })
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'revise',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        status: { from: 'sent', to: 'draft' },
        revision: { from: prevRevision, to: nextRevision },
      },
    });

    return Response.json({ ok: true, revision: nextRevision });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
