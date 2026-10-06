import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { flattenJoin } from '@/lib/array-join';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { safeError } from '@/lib/safe-error';

export const runtime = 'nodejs';

const Schema = z.object({
  message: z.string().trim().min(3).max(5000),
});

/**
 * POST /api/client/contracts/[id]/request-changes — instead of signing, the
 * client says what they'd like changed. The note is stored against the
 * contract they were reading and sent to the studio. The agreement stays
 * open: they can still sign it as-is, and the studio's Revise & resend
 * replaces it with an updated version.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/contracts/[id]/request-changes:${session.userId}`, {
      capacity: 5,
      refillPerSec: 5 / 3600,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Tell us what you would like changed (a few words at least).' },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data } = await sb
      .from('contracts')
      .select(
        'id, status, proposal_id, project_id, contact_id, contacts!inner(user_id, full_name), proposals!inner(title, status, expires_at)',
      )
      .eq('id', id)
      .maybeSingle();
    type Row = {
      status: string;
      proposal_id: string;
      project_id: string | null;
      contact_id: string;
      contacts: { user_id: string | null; full_name: string } | { user_id: string | null; full_name: string }[];
      proposals:
        | { title: string; status: string; expires_at: string | null }
        | { title: string; status: string; expires_at: string | null }[];
    };
    const row = data as unknown as Row | null;
    const contact = row ? flattenJoin(row.contacts) : null;
    if (!row || !contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const proposal = flattenJoin(row.proposals);
    const open =
      (row.status === 'pending_client_signature' || row.status === 'pending_signature') &&
      proposal?.status === 'sent' &&
      !(proposal.expires_at && new Date(proposal.expires_at) <= new Date());
    if (!open) {
      return Response.json(
        { error: 'This agreement is no longer open. Reply to our email and we’ll help.' },
        { status: 409 },
      );
    }

    const { data: created, error } = await sb
      .from('agreement_change_requests')
      .insert({
        contract_id: id,
        proposal_id: row.proposal_id,
        contact_id: row.contact_id,
        message: parsed.data.message,
        created_by: session.userId,
      })
      .select('id, created_at')
      .single();
    if (error || !created) throw new Error(error?.message ?? 'Insert failed');

    await writeAudit({
      actor_id: session.userId,
      action: 'request_changes',
      entity_type: 'contract',
      entity_id: id,
      diff: { change_request_id: (created as { id: string }).id },
    });

    const title = proposal?.title ?? 'Agreement';
    const editorPath = row.project_id
      ? `/admin/projects/${row.project_id}/proposals/${row.proposal_id}`
      : `/admin/proposals/${row.proposal_id}`;
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'agreement_changes_requested',
          userId,
          contractId: id,
          proposalId: row.proposal_id,
          clientName: contact.full_name,
          title,
          message: parsed.data.message,
          editorPath,
        }),
      ),
    );

    return Response.json({ ok: true, created_at: (created as { created_at: string }).created_at });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/contracts/[id]/request-changes', err);
  }
}
