import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentUpdateProspectSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import { appendNote } from '@/lib/outreach/agent-rules';
import type { ProspectStatus } from '@/lib/outreach/meta';

export const runtime = 'nodejs';

/** Fields the assistant may correct or fill in on a prospect. */
const EDITABLE = [
  'full_name',
  'company',
  'phone',
  'email',
  'industry',
  'website',
  'website_problem',
  'source',
  'next_action',
  'next_action_at',
  'status',
] as const;

/**
 * PATCH /api/agent/prospects/[id] — update a prospect: status, the next
 * follow-up, contact details, or a note added under the existing ones. It
 * can't book (that's /api/agent/appointments), reassign, or delete, and it
 * leaves booked, converted, and do-not-contact prospects' status alone.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'prospects');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentUpdateProspectSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const { data: prospect } = await sb
      .from('prospects')
      .select('status, notes')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) return Response.json({ error: 'Not found' }, { status: 404 });
    const p = prospect as { status: ProspectStatus; notes: string | null };

    if (d.status && d.status !== p.status) {
      if (p.status === 'booked' || p.status === 'converted') {
        return Response.json(
          { error: `This prospect is ${p.status}; change it in the CRM.` },
          { status: 409 },
        );
      }
      if (p.status === 'dnc') {
        return Response.json(
          { error: 'This prospect is marked do-not-contact; change it in the CRM.' },
          { status: 409 },
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE) {
      if (key in d) patch[key] = d[key] ?? null;
    }
    if (d.append_note) patch.notes = appendNote(p.notes, d.append_note, Date.now());
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await sb.from('prospects').update(patch).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'update',
      entity_type: 'prospect',
      entity_id: id,
      diff: { ...patch, ...VIA_AGENT },
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/prospects/[id] PATCH', err);
  }
}
