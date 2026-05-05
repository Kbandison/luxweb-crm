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

/**
 * Delete a contact. Three FKs are ON DELETE RESTRICT (legal-records
 * protection): contracts, care_plan_subscriptions, revision_requests.
 * Everything else cascades.
 *
 * Default behavior: pre-check the blockers. If any exist, return 409 with
 * the counts so the UI can warn the admin before nuking legal data.
 *
 * With ?force=true: manually delete the blocking rows (in dependency order)
 * before deleting the contact, then proceed. Audit log captures both the
 * cascade detail and the contact deletion event for legal trace.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const force = new URL(req.url).searchParams.get('force') === 'true';
    const sb = supabaseAdmin();

    // Capture the linked portal user id (if any) BEFORE we delete — once
    // the contact row is gone we lose the link. That auth user gets
    // deleted alongside the contact at the end so the email is freed up
    // for re-invite later.
    const { data: pre } = await sb
      .from('contacts')
      .select('user_id, email')
      .eq('id', id)
      .maybeSingle();
    const linkedUserId =
      (pre as { user_id: string | null } | null)?.user_id ?? null;

    // Count rows that would block on delete restrict.
    const [contracts, carePlans, revisions] = await Promise.all([
      sb
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', id),
      sb
        .from('care_plan_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', id),
      sb
        .from('revision_requests')
        .select('id', { count: 'exact', head: true })
        .eq('contact_id', id),
    ]);
    const blockers = {
      contracts: contracts.count ?? 0,
      carePlans: carePlans.count ?? 0,
      revisions: revisions.count ?? 0,
    };
    const hasBlockers =
      blockers.contracts > 0 ||
      blockers.carePlans > 0 ||
      blockers.revisions > 0;

    if (hasBlockers && !force) {
      return Response.json(
        {
          error:
            'This contact has signed contracts, active care plans, or revision requests.',
          blockers,
        },
        { status: 409 },
      );
    }

    if (hasBlockers && force) {
      // Manually wipe the restrict-protected rows in dependency order.
      // Revisions and care plan subs have no further FKs into them; contracts
      // can stay last. Audit before delete so we have a record of what
      // was destroyed.
      await writeAudit({
        actor_id: session.userId,
        action: 'force_cascade_delete',
        entity_type: 'contact',
        entity_id: id,
        diff: { destroyed: blockers },
      });

      if (blockers.revisions > 0) {
        await sb.from('revision_requests').delete().eq('contact_id', id);
      }
      if (blockers.carePlans > 0) {
        await sb.from('care_plan_subscriptions').delete().eq('contact_id', id);
      }
      if (blockers.contracts > 0) {
        await sb.from('contracts').delete().eq('contact_id', id);
      }
    }

    const { error } = await sb.from('contacts').delete().eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'contact',
      entity_id: id,
    });

    // If the contact had a linked portal login, drop the Supabase Auth
    // user too. crm.users cascades from auth.users, so the mirror row goes
    // with it. Best-effort: if the auth side fails (already deleted, race),
    // we don't want to fail the whole delete — the contact is already gone
    // and the audit log captures the action.
    if (linkedUserId) {
      try {
        const { error: authErr } =
          await sb.auth.admin.deleteUser(linkedUserId);
        if (authErr) {
          console.warn(
            '[contacts.delete] auth user cleanup failed:',
            authErr.message,
          );
        } else {
          await writeAudit({
            actor_id: session.userId,
            action: 'delete',
            entity_type: 'auth_user',
            entity_id: linkedUserId,
            diff: { contact_id: id, source: 'contact_delete' },
          });
        }
      } catch (err) {
        console.warn('[contacts.delete] auth user cleanup threw:', err);
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
