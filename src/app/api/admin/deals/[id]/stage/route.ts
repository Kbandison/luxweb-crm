import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const STAGES = [
  'lead',
  'discovery',
  'proposal',
  'active',
  'completed',
  'retainer',
] as const;

const StageSchema = z.object({ stage: z.enum(STAGES) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = StageSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid stage' }, { status: 400 });
    }

    const { data: before } = await supabaseAdmin()
      .from('deals')
      .select('stage')
      .eq('id', id)
      .single();

    const { data, error } = await supabaseAdmin()
      .from('deals')
      .update({ stage: parsed.data.stage })
      .eq('id', id)
      .select('id, stage, stage_changed_at')
      .single();
    if (error || !data) {
      return Response.json({ error: error?.message }, { status: 500 });
    }

    // Skip audit if it was a no-op (drag back to same column).
    if (before?.stage !== parsed.data.stage) {
      await writeAudit({
        actor_id: session.userId,
        action: 'update',
        entity_type: 'deal',
        entity_id: id,
        diff: { stage: { from: before?.stage, to: parsed.data.stage } },
      });
    }

    return Response.json({ ok: true, stage_changed_at: data.stage_changed_at });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
