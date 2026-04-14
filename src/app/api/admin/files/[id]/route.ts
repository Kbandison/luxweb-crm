import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const BUCKET = 'project-files';

const PatchSchema = z.object({
  is_client_visible: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: before } = await supabaseAdmin()
      .from('files')
      .select()
      .eq('id', id)
      .single();
    const { error } = await supabaseAdmin()
      .from('files')
      .update(parsed.data)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'file',
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

    // Look up the storage path first so we can clean up Supabase Storage.
    const { data: row } = await supabaseAdmin()
      .from('files')
      .select('storage_path, file_name')
      .eq('id', id)
      .single();

    if (row?.storage_path) {
      // Best-effort — ignore errors (file might already be gone from storage).
      await supabaseAdmin()
        .storage.from(BUCKET)
        .remove([row.storage_path as string]);
    }

    const { error } = await supabaseAdmin().from('files').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'file',
      entity_id: id,
      diff: { file_name: row?.file_name },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
