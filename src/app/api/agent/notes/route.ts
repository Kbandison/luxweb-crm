import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { AgentNoteSchema } from '@/lib/validation/agent';
import { agentGate, VIA_AGENT } from '@/lib/outreach/agent-gate';

export const runtime = 'nodejs';

/**
 * POST /api/agent/notes — a private note on a contact or deal. With
 * `activity`, it's also an email the assistant sent or read, recorded on the
 * contact's Activity tab (audit rows on the contact or its deals) so the
 * email history sits with everything else. Notes are always private: never
 * shown in the client portal.
 */
export async function POST(req: Request) {
  try {
    const gate = await agentGate(req, 'notes');
    if (gate instanceof Response) return gate;

    const raw = await req.json().catch(() => ({}));
    const parsed = AgentNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    const sb = supabaseAdmin();
    const table = d.entity_type === 'contact' ? 'contacts' : 'deals';
    const { data: target } = await sb.from(table).select('id').eq('id', d.entity_id).maybeSingle();
    if (!target) return Response.json({ error: 'Not found' }, { status: 404 });

    const { data, error } = await sb
      .from('notes')
      .insert({
        entity_type: d.entity_type,
        entity_id: d.entity_id,
        body: d.body,
        is_private: true,
        author_id: gate.ownerId,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
    }
    const noteId = (data as { id: string }).id;

    await writeAudit(
      d.activity
        ? {
            actor_id: gate.ownerId,
            action: d.activity,
            entity_type: d.entity_type,
            entity_id: d.entity_id,
            diff: { subject: d.subject ?? null, note_id: noteId, ...VIA_AGENT },
          }
        : {
            actor_id: gate.ownerId,
            action: 'create',
            entity_type: 'note',
            entity_id: noteId,
            diff: { on: { type: d.entity_type, id: d.entity_id }, is_private: true, ...VIA_AGENT },
          },
    );

    return Response.json({ id: noteId });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('agent/notes POST', err);
  }
}
