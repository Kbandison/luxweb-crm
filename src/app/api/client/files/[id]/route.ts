import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
const BUCKET = 'project-files';

/**
 * Client can delete files they uploaded themselves. Files uploaded by
 * admin remain untouchable from the client side — admin owns those.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: row } = await sb
      .from('files')
      .select('id, uploaded_by, storage_path, file_name')
      .eq('id', id)
      .maybeSingle();
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    type Shape = {
      uploaded_by: string | null;
      storage_path: string | null;
      file_name: string;
    };
    const r = row as unknown as Shape;
    if (r.uploaded_by !== session.userId) {
      return Response.json(
        { error: 'You can only delete files you uploaded.' },
        { status: 403 },
      );
    }

    if (r.storage_path) {
      // Best-effort — ignore errors if storage already gone.
      await sb.storage.from(BUCKET).remove([r.storage_path]);
    }

    const { error } = await sb.from('files').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'file',
      entity_id: id,
      diff: { file_name: r.file_name, by: 'client' },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
