import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { flattenJoin } from '@/lib/array-join';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const Schema = z.object({ reason: z.string().trim().max(2000).optional() });

/** POST — the client declines a change order. The agreement is unchanged. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/change-orders/decline:${session.userId}`, { capacity: 10, refillPerSec: 10 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: found } = await sb
      .from('change_orders')
      .select('id, contacts!inner(user_id, full_name)')
      .eq('id', id)
      .maybeSingle();
    type Found = { contacts: { user_id: string | null; full_name: string } | { user_id: string | null; full_name: string }[] };
    const contact = found ? flattenJoin((found as unknown as Found).contacts) : null;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const reason = parsed.data.reason?.trim() || null;
    const { data } = await sb
      .from('change_orders')
      .update({ status: 'declined', declined_at: new Date().toISOString(), decline_reason: reason })
      .eq('id', id)
      .eq('status', 'sent')
      .select('number, title, amount_cents, project_id');
    const row = (data ?? [])[0] as
      | { number: number; title: string; amount_cents: number | string; project_id: string }
      | undefined;
    if (!row) {
      return Response.json({ error: 'This change order is no longer open.' }, { status: 409 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'decline',
      entity_type: 'change_order',
      entity_id: id,
      diff: { reason },
    });
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'change_order_update',
          kind: 'declined',
          userId,
          changeOrderId: id,
          clientName: contact.full_name,
          number: row.number,
          title: row.title,
          amountCents: Number(row.amount_cents),
          reason,
          path: `/admin/projects/${row.project_id}/change-orders/${id}`,
        }),
      ),
    );
    revalidateProject(row.project_id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/change-orders/[id]/decline', err);
  }
}
