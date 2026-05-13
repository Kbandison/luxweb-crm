import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const RenameSchema = z.object({
  new_name: z.string().min(1).max(80),
});

/**
 * Tag management.
 *
 * Tags are stored as text[] on crm.contacts.tags — no separate table.
 * Rename walks every contact and replaces matching elements; delete
 * removes the element from every contact's array. Both are audit-logged.
 *
 * PATCH /api/admin/tags/[name]     { new_name } → rename across all contacts
 * DELETE /api/admin/tags/[name]                 → remove from all contacts
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(`admin/tags:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const { name } = await params;
    const oldName = decodeURIComponent(name);
    const raw = await req.json().catch(() => ({}));
    const parsed = RenameSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const newName = parsed.data.new_name.trim();
    if (!newName || newName === oldName) {
      return Response.json({ error: 'No change' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data: rows } = await sb
      .from('contacts')
      .select('id, tags')
      .contains('tags', [oldName]);
    type Row = { id: string; tags: string[] | null };
    const matched = (rows ?? []) as Row[];

    for (const r of matched) {
      const updated = (r.tags ?? []).map((t) =>
        t === oldName ? newName : t,
      );
      await sb.from('contacts').update({ tags: updated }).eq('id', r.id);
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'contact',
      entity_id: 'bulk',
      diff: { tag_rename: { from: oldName, to: newName, contacts: matched.length } },
    });

    return Response.json({ ok: true, affected: matched.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/tags/[name] PATCH', err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(`admin/tags:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const { name } = await params;
    const tagName = decodeURIComponent(name);

    const sb = supabaseAdmin();
    const { data: rows } = await sb
      .from('contacts')
      .select('id, tags')
      .contains('tags', [tagName]);
    type Row = { id: string; tags: string[] | null };
    const matched = (rows ?? []) as Row[];

    for (const r of matched) {
      const filtered = (r.tags ?? []).filter((t) => t !== tagName);
      await sb.from('contacts').update({ tags: filtered }).eq('id', r.id);
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'contact',
      entity_id: 'bulk',
      diff: { tag_delete: { tag: tagName, contacts: matched.length } },
    });

    return Response.json({ ok: true, affected: matched.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/tags/[name] DELETE', err);
  }
}
