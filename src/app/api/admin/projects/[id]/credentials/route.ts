import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/credentials/crypto';
import { CREDENTIAL_KINDS } from '@/lib/types/credential';

export const runtime = 'nodejs';

const Schema = z.object({
  kind: z.enum(CREDENTIAL_KINDS),
  label: z.string().min(1).max(200),
  username: z.string().max(500).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  secret: z.string().min(1).max(20000),
  notes: z.string().max(5000).nullable().optional(),
  visible_to_client: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id: projectId } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const enc = encryptSecret(parsed.data.secret);

    const { data, error } = await supabaseAdmin()
      .from('project_credentials')
      .insert({
        project_id: projectId,
        kind: parsed.data.kind,
        label: parsed.data.label,
        username: parsed.data.username ?? null,
        url: parsed.data.url ?? null,
        notes: parsed.data.notes ?? null,
        visible_to_client: parsed.data.visible_to_client ?? false,
        secret_ciphertext: enc.ciphertext,
        secret_iv: enc.iv,
        secret_tag: enc.tag,
        created_by: session.userId,
      })
      .select('id')
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Failed to create credential' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'credential',
      entity_id: data.id,
      diff: {
        project_id: projectId,
        kind: parsed.data.kind,
        label: parsed.data.label,
        visible_to_client: parsed.data.visible_to_client ?? false,
      },
    });

    return Response.json({ ok: true, id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
