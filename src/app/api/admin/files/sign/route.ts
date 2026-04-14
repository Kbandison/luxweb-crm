import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const BUCKET = 'project-files';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB cap per spec

const Schema = z.object({
  project_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().min(1).max(MAX_BYTES),
  content_type: z.string().max(200).optional().nullable(),
  is_client_visible: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Build a collision-free path. UUID prefix guards against repeat names.
    const safeName = parsed.data.file_name.replace(/[^\w.\- ]+/g, '_');
    const path = `projects/${parsed.data.project_id}/${randomUUID()}-${safeName}`;

    // 1. Create the DB row up-front so the client can reference it.
    const { data: inserted, error: insertErr } = await supabaseAdmin()
      .from('files')
      .insert({
        project_id: parsed.data.project_id,
        file_name: parsed.data.file_name,
        storage_path: path,
        size_bytes: parsed.data.size_bytes,
        content_type: parsed.data.content_type ?? null,
        uploaded_by: session.userId,
        is_client_visible: parsed.data.is_client_visible,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      return Response.json(
        { error: insertErr?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    // 2. Create a signed upload URL the browser can PUT to directly.
    const { data: sign, error: signErr } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path);

    if (signErr || !sign) {
      // Roll back the DB row so we don't orphan the record.
      await supabaseAdmin().from('files').delete().eq('id', inserted.id);
      return Response.json(
        { error: signErr?.message ?? 'Sign failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'file',
      entity_id: inserted.id as string,
      diff: { file_name: parsed.data.file_name, size_bytes: parsed.data.size_bytes },
    });

    return Response.json({
      id: inserted.id,
      path,
      token: sign.token,
      signed_url: sign.signedUrl,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
