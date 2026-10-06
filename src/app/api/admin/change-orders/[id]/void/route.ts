import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { notifyClientOfWithdrawal } from '@/lib/contracts/after-sign';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const Schema = z.object({ reason: z.string().trim().min(3).max(500) });

/**
 * POST — withdraw a change order that hasn't been signed. A signed change
 * order is part of the contract; undoing it takes another change order.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const limit = limitByKey(`admin/change-orders/void:${session.userId}`, { capacity: 20, refillPerSec: 20 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return Response.json({ error: 'Give a reason for withdrawing it.' }, { status: 400 });
    }

    const voidedAt = new Date().toISOString();
    const { data } = await supabaseAdmin()
      .from('change_orders')
      .update({ status: 'void', voided_at: voidedAt, voided_by: session.userId, void_reason: parsed.data.reason })
      .eq('id', id)
      .eq('status', 'sent')
      .select('id, number, title, project_id, contact_id, contract_id');
    const row = (data ?? [])[0] as
      | { id: string; number: number; title: string; project_id: string; contact_id: string; contract_id: string }
      | undefined;
    if (!row) {
      return Response.json(
        { error: 'Only a change order still waiting on the client can be withdrawn.' },
        { status: 409 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'void',
      entity_type: 'change_order',
      entity_id: id,
      diff: { reason: parsed.data.reason, voided_at: voidedAt },
    });
    const { data: contract } = await supabaseAdmin()
      .from('contracts')
      .select('proposal_id')
      .eq('id', row.contract_id)
      .maybeSingle();
    await notifyClientOfWithdrawal({
      contractId: row.contract_id,
      proposalId: (contract as { proposal_id: string } | null)?.proposal_id ?? '',
      contactId: row.contact_id,
      projectId: row.project_id,
      title: `Change order #${row.number}: ${row.title}`,
      reason: parsed.data.reason,
      wasSigned: false,
    });
    revalidateProject(row.project_id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/change-orders/[id]/void', err);
  }
}
