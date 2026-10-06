import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { raiseChangeOrderInvoice, sendChangeOrderExecutedCopy } from '@/lib/change-orders/service';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

/** POST — retry a signed change order's invoice and/or signed-copy email. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const limit = limitByKey(`admin/change-orders/finish:${session.userId}`, { capacity: 10, refillPerSec: 10 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const { data } = await supabaseAdmin()
      .from('change_orders')
      .select('status, project_id, invoice_state, executed_copy_sent_at')
      .eq('id', id)
      .maybeSingle();
    const row = data as {
      status: string;
      project_id: string;
      invoice_state: string;
      executed_copy_sent_at: string | null;
    } | null;
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
    if (row.status !== 'signed') {
      return Response.json({ error: 'Only a signed change order has setup to finish.' }, { status: 409 });
    }
    const invoice = ['pending', 'failed', 'running'].includes(row.invoice_state)
      ? await raiseChangeOrderInvoice(id)
      : null;
    const copySent = row.executed_copy_sent_at ? null : await sendChangeOrderExecutedCopy(id);
    revalidateProject(row.project_id);
    return Response.json({
      ok: true,
      invoice_state: invoice?.state ?? row.invoice_state,
      executed_copy_sent: copySent ?? true,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/change-orders/[id]/finish-setup', err);
  }
}
