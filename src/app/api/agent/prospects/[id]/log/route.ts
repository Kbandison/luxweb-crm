import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { getOutreachSettings } from '@/lib/queries/outreach';
import { AgentLogSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';
import {
  agentNextStatus,
  countsAsAttempt,
  resolveOccurredAt,
} from '@/lib/outreach/agent-rules';
import type { ProspectStatus } from '@/lib/outreach/meta';

export const runtime = 'nodejs';

/**
 * POST /api/agent/prospects/[id]/log — the assistant records a touch on a
 * prospect: an email it sent ('contacted'), a reply it read (interested,
 * not interested, dnc, ...), or a call. Same history row and prospect update
 * as a setter's log, with three differences: the row is marked with its
 * channel (emails don't count as dials), it can be backdated to when the
 * email actually went out, and an outbound email never downgrades a prospect
 * who is further along. Booking goes through /api/agent/appointments.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await agentGate(req, 'log');
    if (gate instanceof Response) return gate;
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentLogSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const when = resolveOccurredAt(d.occurred_at, Date.now());
    if (!when.ok) return Response.json({ error: when.error }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: prospect } = await sb
      .from('prospects')
      .select('status, attempts, last_contacted_at')
      .eq('id', id)
      .maybeSingle();
    if (!prospect) return Response.json({ error: 'Not found' }, { status: 404 });
    const p = prospect as {
      status: ProspectStatus;
      attempts: number | null;
      last_contacted_at: string | null;
    };

    // Do-not-contact is final until a person in the CRM changes it.
    if (p.status === 'dnc') {
      return Response.json(
        { error: 'This prospect is marked do-not-contact.' },
        { status: 409 },
      );
    }

    const { error: callErr } = await sb.from('prospect_calls').insert({
      prospect_id: id,
      setter_id: gate.ownerId,
      channel: d.channel,
      disposition: d.disposition,
      spoke_with_dm: d.spoke_with_dm ?? false,
      note: d.note ?? null,
      called_at: when.iso,
    });
    if (callErr) return Response.json({ error: callErr.message }, { status: 500 });

    const attempts = (p.attempts ?? 0) + (countsAsAttempt(d.disposition, d.channel) ? 1 : 0);
    let status = agentNextStatus(p.status, d.disposition);

    // Same auto-retire as a setter's dials: N unanswered calls and the
    // prospect leaves the working queue.
    let retired = false;
    if (d.channel === 'call' && d.disposition === 'no_answer') {
      const { autoRetireAfter } = await getOutreachSettings();
      if (autoRetireAfter > 0 && attempts >= autoRetireAfter) {
        status = 'unreachable';
        retired = true;
      }
    }

    // A backdated touch mustn't move "last contacted" backwards.
    const lastContacted =
      p.last_contacted_at && new Date(p.last_contacted_at) > new Date(when.iso)
        ? p.last_contacted_at
        : when.iso;

    const update: Record<string, unknown> = {
      status,
      attempts,
      last_contacted_at: lastContacted,
    };
    if ('next_action' in d) update.next_action = d.next_action ?? null;
    if ('next_action_at' in d) update.next_action_at = d.next_action_at ?? null;

    const { error: updErr } = await sb.from('prospects').update(update).eq('id', id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    await writeAudit({
      actor_id: gate.ownerId,
      action: 'update',
      entity_type: 'prospect',
      entity_id: id,
      diff: {
        channel: d.channel,
        disposition: d.disposition,
        status,
        ...(retired ? { auto_retired: true } : {}),
        ...VIA_AGENT,
      },
    });

    return Response.json({ ok: true, status, attempts, retired });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/prospects/[id]/log POST', err);
  }
}
