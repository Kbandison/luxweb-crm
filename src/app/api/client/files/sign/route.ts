import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const BUCKET = 'project-files';
const MAX_BYTES = 50 * 1024 * 1024; // 50MB cap per spec — mirror admin

const Schema = z.object({
  project_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  size_bytes: z.number().int().min(1).max(MAX_BYTES),
  content_type: z.string().max(200).optional().nullable(),
});

/**
 * Client-side file upload sign. Mirrors /api/admin/files/sign but:
 *   - verifies the caller owns the project via contacts.user_id
 *   - forces is_client_visible = true (client uploads are by definition
 *     visible to the client side)
 *   - stamps uploaded_by with the client's user id so the admin tab
 *     can distinguish client-uploaded files
 */
export async function POST(req: Request) {
  try {
    const session = await requireClient();
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Ownership check — project must belong to a contact owned by this user.
    const sb = supabaseAdmin();
    const { data: ownership } = await sb
      .from('projects')
      .select('id, contacts!inner(user_id)')
      .eq('id', parsed.data.project_id)
      .maybeSingle();
    type Shape = {
      contacts:
        | { user_id: string | null }
        | { user_id: string | null }[];
    };
    const o = ownership as unknown as Shape | null;
    const contact = o
      ? Array.isArray(o.contacts)
        ? o.contacts[0]
        : o.contacts
      : null;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Build a collision-free path. UUID prefix guards against repeat names.
    const safeName = parsed.data.file_name.replace(/[^\w.\- ]+/g, '_');
    const path = `projects/${parsed.data.project_id}/${randomUUID()}-${safeName}`;

    // 1. Create the DB row up-front so the client can reference it.
    const { data: inserted, error: insertErr } = await sb
      .from('files')
      .insert({
        project_id: parsed.data.project_id,
        file_name: parsed.data.file_name,
        storage_path: path,
        size_bytes: parsed.data.size_bytes,
        content_type: parsed.data.content_type ?? null,
        uploaded_by: session.userId,
        is_client_visible: true,
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
    const { data: sign, error: signErr } = await sb
      .storage.from(BUCKET)
      .createSignedUploadUrl(path);

    if (signErr || !sign) {
      // Roll back the DB row so we don't orphan the record.
      await sb.from('files').delete().eq('id', inserted.id);
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
      diff: {
        file_name: parsed.data.file_name,
        size_bytes: parsed.data.size_bytes,
        by: 'client',
      },
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
