import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { raiseDeposit, sendExecutedCopy } from '@/lib/contracts/after-sign';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/admin/contracts/[id]/finish-setup
 *
 * Retry whatever didn't complete after a client signed: the deposit invoice
 * (when it's pending or failed) and the executed copy email (when it never
 * went out). Both steps claim their own work, so pressing this twice — or
 * while the original is still running — can't double-invoice or double-send.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const limit = limitByKey(`admin/contracts/[id]/finish-setup:${session.userId}`, {
      capacity: 10,
      refillPerSec: 10 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const { data } = await supabaseAdmin()
      .from('contracts')
      .select('status, project_id, deposit_state, executed_copy_sent_at')
      .eq('id', id)
      .maybeSingle();
    const row = data as {
      status: string;
      project_id: string | null;
      deposit_state: string | null;
      executed_copy_sent_at: string | null;
    } | null;
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
    if (row.status !== 'signed') {
      return Response.json({ error: 'Only a signed agreement has setup to finish.' }, { status: 409 });
    }

    const deposit =
      row.deposit_state === 'pending' ||
      row.deposit_state === 'failed' ||
      row.deposit_state === 'running'
        ? await raiseDeposit(id)
        : null;
    const copySent = row.executed_copy_sent_at ? null : await sendExecutedCopy(id);

    await writeAudit({
      actor_id: session.userId,
      action: 'finish_setup',
      entity_type: 'contract',
      entity_id: id,
      diff: { deposit_state: deposit?.state ?? row.deposit_state, executed_copy_sent: copySent },
    });
    if (row.project_id) revalidateProject(row.project_id);

    return Response.json({
      ok: true,
      deposit_state: deposit?.state ?? row.deposit_state,
      executed_copy_sent: copySent ?? Boolean(row.executed_copy_sent_at),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contracts/[id]/finish-setup', err);
  }
}
