import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentDealStageSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import { agentMayMoveDeal } from '@/lib/outreach/agent-rules';

export const runtime = 'nodejs';

/**
 * PATCH /api/agent/deals/[id]/stage — move a deal between lead, discovery,
 * and proposal (a call booked → discovery). Active, completed, and retainer
 * follow payments and signatures, so the assistant can't move a deal into
 * them or out of them.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'deals');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentDealStageSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data: before } = await sb.from('deals').select('stage').eq('id', id).maybeSingle();
    if (!before) return Response.json({ error: 'Not found' }, { status: 404 });
    const from = (before as { stage: string }).stage;

    if (!agentMayMoveDeal(from)) {
      return Response.json(
        { error: `This deal is ${from}; only Kevin moves it from there.` },
        { status: 409 },
      );
    }
    if (from === parsed.data.stage) return Response.json({ ok: true, stage: from });

    const { error } = await sb.from('deals').update({ stage: parsed.data.stage }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'update',
      entity_type: 'deal',
      entity_id: id,
      diff: { stage: { from, to: parsed.data.stage }, ...VIA_AGENT },
    });
    return Response.json({ ok: true, stage: parsed.data.stage });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/deals/[id]/stage PATCH', err);
  }
}
