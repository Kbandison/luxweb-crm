import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import {
  deriveContractVariables,
  renderAgreement,
} from '@/lib/contracts/render';
import { namesMatch } from '@/lib/signatures/match';
import type { ProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
});

/**
 * Admin signs the agreement first. Creates the contract row with admin
 * signature captured + body snapshot rendered from the agreement template,
 * then notifies the client to add their signature.
 *
 * Status flow: (no contract) → pending_client_signature → signed
 *
 * Idempotent in the sense that if a contract already exists for this
 * proposal it returns 409 with the existing contract id.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
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
      .from('proposals')
      .select(
        'id, status, project_id, contact_id, accepted_at, content_json, contacts!inner(full_name)',
      )
      .eq('id', id)
      .single();
    if (!row) {
      return Response.json({ error: 'Proposal not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      project_id: string | null;
      contact_id: string | null;
      accepted_at: string | null;
      content_json: unknown;
      contacts:
        | { full_name: string }
        | { full_name: string }[];
    };
    const r = row as unknown as Shape;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;

    if (r.status !== 'accepted') {
      return Response.json(
        { error: `Proposal is ${r.status}; only accepted proposals can be counter-signed.` },
        { status: 409 },
      );
    }

    const { data: existing } = await sb
      .from('contracts')
      .select('id, status')
      .eq('proposal_id', id)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return Response.json(
        {
          error: 'A contract already exists for this proposal.',
          contract_id: (existing as { id: string }).id,
        },
        { status: 409 },
      );
    }

    const content = (r.content_json ?? null) as ProposalContent | null;
    if (!content) {
      return Response.json(
        { error: 'Proposal has no content to render from.' },
        { status: 400 },
      );
    }

    // Pull admin's full_name from crm.users — typed signature must match.
    const { data: adminUser } = await sb
      .from('users')
      .select('full_name')
      .eq('id', session.userId)
      .maybeSingle();
    const adminName =
      (adminUser as { full_name: string | null } | null)?.full_name ?? null;
    if (!namesMatch(parsed.data.full_name, adminName)) {
      return Response.json(
        {
          error: adminName
            ? `Signature must match the name on file: ${adminName}.`
            : 'No full name on file for this account. Update your profile before signing.',
        },
        { status: 422 },
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      null;
    const userAgent = req.headers.get('user-agent') ?? null;
    const adminSignedAt = new Date().toISOString();

    const effectiveDate = r.accepted_at ?? adminSignedAt;
    const variables = deriveContractVariables(content, { effectiveDate });
    const agreementVersion = content.agreement_version || '1.1';
    const { body_md, version } = await renderAgreement(variables, {
      version: `v${agreementVersion.replace(/^v/, '')}`,
    });

    const { data: cRow, error: cErr } = await sb
      .from('contracts')
      .insert({
        proposal_id: id,
        project_id: r.project_id,
        contact_id: r.contact_id,
        agreement_version: version,
        body_md,
        variables,
        status: 'pending_client_signature',
        admin_signed_name: parsed.data.full_name,
        admin_signed_at: adminSignedAt,
        admin_signed_ip: ip,
        admin_signed_user_agent: userAgent,
      })
      .select('id')
      .single();

    if (cErr || !cRow) {
      return Response.json(
        { error: cErr?.message ?? 'Failed to create contract' },
        { status: 500 },
      );
    }

    const contractId = (cRow as { id: string }).id;

    await writeAudit({
      actor_id: session.userId,
      action: 'sign',
      entity_type: 'contract',
      entity_id: contractId,
      diff: {
        proposal_id: id,
        signed_name: parsed.data.full_name,
        ip,
        user_agent: userAgent,
        signed_at: adminSignedAt,
        agreement_version: version,
        by: 'admin',
      },
    });

    if (r.project_id) revalidateProject(r.project_id);

    // Notify the client to add their signature.
    if (r.contact_id) {
      const clientUserId = await getContactUserId(r.contact_id);
      if (clientUserId) {
        await notify({
          type: 'contract_pending_client_signature',
          userId: clientUserId,
          contractId,
          proposalId: id,
          clientName: contact?.full_name ?? '—',
          contractPath: `/portal/contracts/${contractId}`,
        });
      }
    }

    return Response.json({ ok: true, contract_id: contractId });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
