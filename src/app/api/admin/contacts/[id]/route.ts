import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  source: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  lead_score: z.number().int().min(0).max(100).optional(),
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
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data: before } = await supabaseAdmin()
      .from('contacts')
      .select()
      .eq('id', id)
      .single();

    const { data, error } = await supabaseAdmin()
      .from('contacts')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Update failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'contact',
      entity_id: id,
      diff: { before, after: data },
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

    const { error } = await supabaseAdmin()
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'contact',
      entity_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
