import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { flattenJoin } from '@/lib/array-join';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/**
 * POST /api/client/contracts/[id]/viewed — the client opened their
 * agreement. Counts the view (atomically, in the database) and, on the very
 * first open, tells the studio in-app. Only views of an agreement still
 * waiting on them are counted; reopening a signed one isn't news.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/contracts/[id]/viewed:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const sb = supabaseAdmin();
    const { data } = await sb
      .from('contracts')
      .select('id, status, project_id, contacts!inner(user_id, full_name), proposals!inner(title)')
      .eq('id', id)
      .maybeSingle();
    type Row = {
      status: string;
      project_id: string | null;
      contacts: { user_id: string | null; full_name: string } | { user_id: string | null; full_name: string }[];
      proposals: { title: string } | { title: string }[];
    };
    const row = data as unknown as Row | null;
    const contact = row ? flattenJoin(row.contacts) : null;
    if (!row || !contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.status !== 'pending_client_signature' && row.status !== 'pending_signature') {
      return Response.json({ ok: true, counted: false });
    }

    const { data: first, error } = await sb.rpc('record_agreement_view', { p_contract_id: id });
    if (error) throw new Error(error.message);

    if (first === true) {
      const title = flattenJoin(row.proposals)?.title ?? 'Agreement';
      const adminIds = await getAdminUserIds();
      await Promise.all(
        adminIds.map((userId) =>
          notify(
            {
              type: 'agreement_viewed',
              userId,
              contractId: id,
              clientName: contact.full_name,
              title,
              contractPath: row.project_id
                ? `/admin/projects/${row.project_id}/contracts/${id}`
                : `/admin/contracts/${id}`,
            },
            { inAppOnly: true },
          ),
        ),
      );
    }
    return Response.json({ ok: true, counted: true, first: first === true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/contracts/[id]/viewed', err);
  }
}
