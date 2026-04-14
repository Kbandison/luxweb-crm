import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  total_cents: z.number().int().min(0).nullable().optional(),
  expires_at: z.string().nullable().optional(),
  // content_json accepts any object — validated loosely so the editor can
  // evolve without server-side coupling. Admin-only mutation anyway.
  content_json: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Accepted proposals are locked — the client signed it, admin can't
    // change it out from under them. Explicit 409 so the UI can surface
    // the reason. Rejected/expired can still be edited to re-open.
    const { data: current } = await supabaseAdmin()
      .from('proposals')
      .select('status')
      .eq('id', id)
      .single();
    if ((current?.status as string) === 'accepted') {
      return Response.json(
        { error: 'Proposal is accepted and locked. Edits are disabled.' },
        { status: 409 },
      );
    }

    const { error } = await supabaseAdmin()
      .from('proposals')
      .update(parsed.data)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { fields: Object.keys(parsed.data) },
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    const { data: current } = await supabaseAdmin()
      .from('proposals')
      .select('status')
      .eq('id', id)
      .single();
    if ((current?.status as string) === 'accepted') {
      return Response.json(
        { error: 'Accepted proposals cannot be deleted.' },
        { status: 409 },
      );
    }

    const { error } = await supabaseAdmin()
      .from('proposals')
      .delete()
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'proposal',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
