import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/credentials/crypto';
import { CREDENTIAL_KINDS } from '@/lib/types/credential';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  kind: z.enum(CREDENTIAL_KINDS).optional(),
  label: z.string().min(1).max(200).optional(),
  username: z.string().max(500).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  secret: z.string().min(1).max(20000).optional(),
  notes: z.string().max(5000).nullable().optional(),
  visible_to_client: z.boolean().optional(),
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
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error?.issues ?? [] },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.kind !== undefined) update.kind = parsed.data.kind;
    if (parsed.data.label !== undefined) update.label = parsed.data.label;
    if (parsed.data.username !== undefined)
      update.username = parsed.data.username;
    if (parsed.data.url !== undefined) update.url = parsed.data.url;
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
    if (parsed.data.visible_to_client !== undefined)
      update.visible_to_client = parsed.data.visible_to_client;
    if (parsed.data.secret !== undefined) {
      const enc = encryptSecret(parsed.data.secret);
      update.secret_ciphertext = enc.ciphertext;
      update.secret_iv = enc.iv;
      update.secret_tag = enc.tag;
    }

    const { error } = await supabaseAdmin()
      .from('project_credentials')
      .update(update)
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'credential',
      entity_id: id,
      diff: {
        fields: Object.keys(parsed.data).filter((k) => k !== 'secret'),
        rotated_secret: parsed.data.secret !== undefined,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
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
      .from('project_credentials')
      .delete()
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'credential',
      entity_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
