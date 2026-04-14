import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  body: z.string().min(1).max(8000).optional(),
  is_private: z.boolean().optional(),
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

    const { data: before } = await supabaseAdmin()
      .from('notes')
      .select()
      .eq('id', id)
      .single();

    const { error } = await supabaseAdmin()
      .from('notes')
      .update(parsed.data)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'note',
      entity_id: id,
      diff: { before, after: parsed.data },
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
    const { error } = await supabaseAdmin().from('notes').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'note',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
