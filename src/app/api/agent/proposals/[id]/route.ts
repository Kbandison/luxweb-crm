import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { mergeDraftContent } from '@/lib/proposals/agent-draft';
import { problemsBeforeSend } from '@/lib/proposals/validate';
import type { ProposalContent } from '@/lib/types/proposal';
import { AgentUpdateProposalSchema } from '@/lib/validation/agent-proposals';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';

export const runtime = 'nodejs';

/**
 * PATCH /api/agent/proposals/[id] — edit a draft agreement: its title, and
 * content laid over what's stored. Drafts only. Once Kevin has sent it the
 * client is reviewing it, and once signed it's a contract, so anything past
 * draft is refused (409).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'proposals');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentUpdateProposalSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const { data: before } = await sb
      .from('proposals')
      .select('status, content_json')
      .eq('id', id)
      .maybeSingle();
    if (!before) return Response.json({ error: 'Not found' }, { status: 404 });
    const b = before as { status: string; content_json: ProposalContent | null };
    if (b.status !== 'draft') {
      return Response.json(
        { error: `This agreement is ${b.status}; only drafts can be edited here.` },
        { status: 409 },
      );
    }
    if (!b.content_json) {
      return Response.json({ error: 'Agreement has no content yet.' }, { status: 422 });
    }

    const content = d.content ? mergeDraftContent(b.content_json, d.content) : b.content_json;
    const update: Record<string, unknown> = {
      content_json: content,
      total_cents: content.investment.total_cents,
    };
    if (d.title) update.title = d.title;

    // Only while it's still a draft, so an edit can't land on an agreement
    // Kevin sent in the meantime.
    const { data: rows, error } = await sb
      .from('proposals')
      .update(update)
      .eq('id', id)
      .eq('status', 'draft')
      .select('id');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if ((rows ?? []).length === 0) {
      return Response.json(
        { error: 'This agreement is no longer a draft; only drafts can be edited here.' },
        { status: 409 },
      );
    }

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { fields: Object.keys(d), ...VIA_AGENT },
    });

    return Response.json({ ok: true, problems: problemsBeforeSend(content) });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/proposals/[id] PATCH', err);
  }
}
