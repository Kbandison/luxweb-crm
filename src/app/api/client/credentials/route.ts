import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/credentials/crypto';
import { CREDENTIAL_KINDS } from '@/lib/types/credential';

export const runtime = 'nodejs';

const Schema = z.object({
  project_id: z.string().uuid(),
  kind: z.enum(CREDENTIAL_KINDS),
  label: z.string().min(1).max(200),
  username: z.string().max(500).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
  secret: z.string().min(1).max(20000),
  notes: z.string().max(5000).nullable().optional(),
});

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

    // Confirm the client actually owns the project before letting them write.
    const ownership = await supabaseAdmin()
      .from('projects')
      .select('id, contacts!inner(user_id)')
      .eq('id', parsed.data.project_id)
      .single();
    type OwnershipRow = {
      id: string;
      contacts:
        | { user_id: string | null }
        | { user_id: string | null }[];
    };
    const o = (ownership.data ?? null) as OwnershipRow | null;
    const contact = o
      ? Array.isArray(o.contacts)
        ? o.contacts[0]
        : o.contacts
      : null;
    if (!o || !contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const enc = encryptSecret(parsed.data.secret);

    const { data, error } = await supabaseAdmin()
      .from('project_credentials')
      .insert({
        project_id: parsed.data.project_id,
        kind: parsed.data.kind,
        label: parsed.data.label,
        username: parsed.data.username ?? null,
        url: parsed.data.url ?? null,
        notes: parsed.data.notes ?? null,
        // Client-added credentials are always visible to the client (they
        // must be able to see what they handed over). Admin sees everything.
        visible_to_client: true,
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
        project_id: parsed.data.project_id,
        kind: parsed.data.kind,
        label: parsed.data.label,
        by: 'client',
      },
    });

    return Response.json({ ok: true, id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
