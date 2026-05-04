import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import {
  deriveContractVariables,
  renderAgreement,
} from '@/lib/contracts/render';
import type { ProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

/**
 * Manually generate a contract for an already-accepted proposal that
 * doesn't have one yet. Covers the recovery case where auto-gen on
 * accept failed (e.g., template file wasn't bundled in production) so
 * the proposal is in 'accepted' state with no matching contracts row.
 *
 * Idempotent — returns 409 if a contract already exists for this proposal.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: row } = await sb
      .from('proposals')
      .select(
        'id, status, project_id, contact_id, accepted_at, content_json',
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
    };
    const r = row as unknown as Shape;

    if (r.status !== 'accepted') {
      return Response.json(
        { error: `Proposal is ${r.status}; only accepted proposals can have a contract generated.` },
        { status: 409 },
      );
    }

    const { data: existing } = await sb
      .from('contracts')
      .select('id')
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

    const effectiveDate = r.accepted_at ?? new Date().toISOString();
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
        status: 'pending_signature',
      })
      .select('id')
      .single();

    if (cErr || !cRow) {
      return Response.json(
        { error: cErr?.message ?? 'Failed to insert contract' },
        { status: 500 },
      );
    }

    const contractId = (cRow as { id: string }).id;

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'contract',
      entity_id: contractId,
      diff: {
        proposal_id: id,
        agreement_version: version,
        source: 'admin_manual_regenerate',
      },
    });

    return Response.json({ ok: true, contract_id: contractId });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
