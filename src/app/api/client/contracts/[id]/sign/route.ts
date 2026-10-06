import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { completeSigning } from '@/lib/contracts/after-sign';
import { namesMatch } from '@/lib/signatures/match';
import type { ProposalContent } from '@/lib/types/proposal';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
});

/**
 * Client signs the agreement. Marks the contract as signed, then (see
 * completeSigning):
 *   - Puts it on a project — the one it's already on, an empty shell
 *     project for the contact, or a new one — and seeds milestones.
 *   - Records anything the client paid before signing as a paid invoice.
 *   - Raises the deposit invoice on the Agreement's Net terms.
 *   - Notifies admin.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/contracts/[id]/sign:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    const { data: row } = await sb
      .from('contracts')
      .select(
        'id, status, agreement_version, proposal_id, project_id, contact_id, contacts!inner(full_name, user_id), proposals!inner(title, total_cents, content_json, deal_id)',
      )
      .eq('id', id)
      .single();

    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      agreement_version: string;
      proposal_id: string;
      project_id: string | null;
      contact_id: string;
      contacts:
        | { full_name: string; user_id: string | null }
        | { full_name: string; user_id: string | null }[];
      proposals:
        | {
            title: string;
            total_cents: number | string | null;
            content_json: unknown;
            deal_id: string | null;
          }
        | {
            title: string;
            total_cents: number | string | null;
            content_json: unknown;
            deal_id: string | null;
          }[];
    };
    const r = row as unknown as Shape;
    const contact = flattenJoin(r.contacts);
    const proposal = flattenJoin(r.proposals);

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Accept either the new pending_client_signature status or the legacy
    // pending_signature value (single-sig flow).
    if (
      r.status !== 'pending_client_signature' &&
      r.status !== 'pending_signature'
    ) {
      return Response.json(
        { error: `Contract is ${r.status}, no longer accepting signature.` },
        { status: 409 },
      );
    }

    if (!namesMatch(parsed.data.full_name, contact.full_name)) {
      return Response.json(
        {
          error: `Signature must match the name on file: ${contact.full_name}.`,
        },
        { status: 422 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    const signedAt = new Date().toISOString();

    // Conditional on the status we just checked, so two submits in flight
    // (two tabs, a retry on a slow connection) can't both sign — each one
    // used to go on to create a project and send a deposit invoice.
    const { data: signedRows, error } = await sb
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_name: parsed.data.full_name,
        signed_ip: ip,
        signed_user_agent: userAgent,
      })
      .eq('id', id)
      .in('status', ['pending_client_signature', 'pending_signature'])
      .select('id');

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if ((signedRows ?? []).length === 0) {
      return Response.json(
        { error: 'This agreement was already signed.' },
        { status: 409 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'sign',
      entity_type: 'contract',
      entity_id: id,
      diff: {
        signed_name: parsed.data.full_name,
        ip,
        user_agent: userAgent,
        signed_at: signedAt,
        agreement_version: r.agreement_version,
        by: 'client',
      },
    });

    // Project, milestones, prepaid payments, deposit invoice.
    let completed: Awaited<ReturnType<typeof completeSigning>>;
    try {
      completed = await completeSigning({
        contractId: id,
        contractProjectId: r.project_id,
        proposalId: r.proposal_id,
        contactId: r.contact_id,
        clientUserId: session.userId,
        proposal: {
          title: proposal?.title ?? '',
          totalCents:
            proposal?.total_cents == null ? null : Number(proposal.total_cents),
          content: (proposal?.content_json ?? null) as ProposalContent | null,
          dealId: proposal?.deal_id ?? null,
        },
      });
    } catch (err) {
      // The signature stands; the setup behind it didn't finish. Say so
      // plainly instead of a generic error that reads like signing failed.
      console.error('[contract sign] post-sign setup failed:', err);
      await writeAudit({
        actor_id: session.userId,
        action: 'post_sign_setup_failed',
        entity_type: 'contract',
        entity_id: id,
        diff: { message: err instanceof Error ? err.message : String(err) },
      });
      return Response.json(
        {
          error:
            "Your signature was recorded, but we couldn't finish setting up your project. We'll take it from here and be in touch.",
        },
        { status: 500 },
      );
    }
    const { projectId, depositStatus, depositInvoiceId } = completed;

    // Notify admin(s) that the contract is fully signed.
    const adminIds = await getAdminUserIds();
    if (adminIds.length > 0) {
      const contractPath = `/admin/projects/${projectId}/contracts/${id}`;
      await Promise.all(
        adminIds.map((userId) =>
          notify({
            type: 'contract_signed',
            userId,
            contractId: id,
            proposalId: r.proposal_id,
            title: proposal?.title ?? 'Contract',
            totalCents:
              proposal?.total_cents == null
                ? null
                : Number(proposal.total_cents),
            clientName: contact.full_name,
            signedAt,
            agreementVersion: r.agreement_version,
            contractPath,
          }),
        ),
      );
    }

    revalidateProject(projectId);

    return Response.json({
      ok: true,
      signed_at: signedAt,
      project_id: projectId,
      deposit_invoice_id: depositInvoiceId,
      deposit_status: depositStatus,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
