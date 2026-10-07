import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { encryptSecret } from '@/lib/credentials/crypto';
import { CREDENTIAL_KINDS, type CredentialKind } from '@/lib/types/credential';
import {
  CREDENTIAL_KIND_FIELDS,
  credentialUrlError,
  normalizeCredentialUrl,
} from '@/lib/credentials/fields';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  kind: z.enum(CREDENTIAL_KINDS).optional(),
  label: z.string().min(1).max(200).optional(),
  username: z.string().max(500).nullable().optional(),
  // Checked against the (new or stored) kind below — SFTP takes a host.
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
    const session = await requireCapability('manage_projects');
    const limit = limitByKey(`admin/credentials/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error?.issues ?? [] },
        { status: 400 },
      );
    }

    // The url's rules and the fields worth keeping depend on the kind, which
    // the patch may change or omit — so read the stored row first.
    const { data: existing } = await supabaseAdmin()
      .from('project_credentials')
      .select('kind, url')
      .eq('id', id)
      .maybeSingle();
    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const kind = (parsed.data.kind ?? existing.kind) as CredentialKind;
    const fields = CREDENTIAL_KIND_FIELDS[kind];
    const kindChanged = parsed.data.kind !== undefined;

    const update: Record<string, unknown> = {};
    if (kindChanged) update.kind = kind;
    if (parsed.data.label !== undefined) update.label = parsed.data.label;
    if (parsed.data.url !== undefined || kindChanged) {
      // A kind switch re-checks the stored url too (e.g. an SFTP host
      // turning into a clickable Login URL).
      const url =
        parsed.data.url !== undefined
          ? parsed.data.url
          : (existing.url as string | null);
      const message = fields.url ? credentialUrlError(kind, url) : null;
      if (message) {
        return Response.json(
          { error: message, issues: [{ message, path: ['url'] }] },
          { status: 400 },
        );
      }
      update.url = normalizeCredentialUrl(kind, url);
    }
    // Fields this kind's form doesn't show are cleared — the edit form hides
    // them on a type switch but still sends what was in them.
    if (!fields.username) update.username = null;
    else if (parsed.data.username !== undefined)
      update.username = parsed.data.username;
    if (!fields.notes) update.notes = null;
    else if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
    if (parsed.data.visible_to_client !== undefined)
      update.visible_to_client = parsed.data.visible_to_client;
    if (!fields.secret) {
      // Same empty triple a URL-kind credential gets on create.
      update.secret_ciphertext = '';
      update.secret_iv = '';
      update.secret_tag = '';
    } else if (parsed.data.secret !== undefined) {
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
        rotated_secret: fields.secret && parsed.data.secret !== undefined,
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/credentials/[id]', err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_projects');
    const limit = limitByKey(`admin/credentials/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
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
    return safeError('admin/credentials/[id]', err);
  }
}
