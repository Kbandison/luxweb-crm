import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';
import { createAndSendInvoice } from '@/lib/invoices/create';
import { namesMatch } from '@/lib/signatures/match';
import type { ProposalContent } from '@/lib/types/proposal';

export const runtime = 'nodejs';

const Schema = z.object({
  full_name: z.string().min(2).max(200),
  agreed: z.literal(true),
});

/**
 * Client signs the agreement. Marks the contract as signed, then:
 *   - Auto-creates a project for the contact if none exists yet, linking
 *     the proposal + contract to it.
 *   - Generates the deposit invoice from the proposal's first milestone
 *     (or full total, if no milestones are defined) and emails it.
 *   - Notifies admin.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
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
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const proposal = Array.isArray(r.proposals) ? r.proposals[0] : r.proposals;

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

    const { error } = await sb
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_name: parsed.data.full_name,
        signed_ip: ip,
        signed_user_agent: userAgent,
      })
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
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

    // Auto-create a project for this contact if none exists, then link
    // the proposal + contract to it. The project may have already been
    // created during contract sign retries — handle that idempotently.
    let projectId = r.project_id;
    if (!projectId) {
      const { data: existingProj } = await sb
        .from('projects')
        .select('id')
        .eq('contact_id', r.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingProj) {
        projectId = (existingProj as { id: string }).id;
      } else {
        const content = (proposal?.content_json ?? null) as ProposalContent | null;
        const totalCents =
          proposal?.total_cents == null ? null : Number(proposal.total_cents);
        const targetLaunch = content?.timeline?.target_launch || null;
        const { data: newProj, error: projErr } = await sb
          .from('projects')
          .insert({
            name: proposal?.title ?? 'New project',
            status: 'planning',
            contact_id: r.contact_id,
            deal_id: proposal?.deal_id ?? null,
            budget_cents: totalCents,
            end_date: targetLaunch,
          })
          .select('id')
          .single();
        if (projErr || !newProj) {
          return Response.json(
            { error: projErr?.message ?? 'Failed to create project' },
            { status: 500 },
          );
        }
        projectId = (newProj as { id: string }).id;
        await writeAudit({
          actor_id: session.userId,
          action: 'create',
          entity_type: 'project',
          entity_id: projectId,
          diff: {
            contact_id: r.contact_id,
            source: 'contract_signed_auto',
          },
        });

        // Seed milestones from the proposal's payment plan. First one
        // starts 'pending' (active work). Rest start 'inactive' (locked);
        // they auto-unlock one-by-one as payments land via the chain
        // advance. source='proposal' enrolls them in the auto-flip;
        // admin-added milestones default to 'manual' and stay manual-only.
        const propMs = content?.investment?.milestones ?? [];
        if (propMs.length > 0) {
          const rows = propMs.map((m, i) => {
            const dollars = (m.amount_cents / 100).toFixed(
              m.amount_cents % 100 === 0 ? 0 : 2,
            );
            const descBits = [`$${dollars}`];
            if (m.due) descBits.push(m.due);
            return {
              project_id: projectId,
              title: m.label || `Milestone ${i + 1}`,
              description: descBits.join(' · '),
              status: i === 0 ? 'pending' : 'inactive',
              source: 'proposal',
              sort_order: i,
              is_client_visible: true,
              amount_cents: m.amount_cents,
            };
          });
          try {
            await sb.from('milestones').insert(rows);
          } catch {
            // Best-effort. Project creation already succeeded; admin can
            // add milestones manually if this fails.
          }
        }
      }
    }

    // Link proposal + contract to the project (covers both the just-created
    // case and earlier rows that were contact-scoped).
    await sb
      .from('proposals')
      .update({ project_id: projectId })
      .eq('id', r.proposal_id)
      .is('project_id', null);
    await sb
      .from('contracts')
      .update({ project_id: projectId })
      .eq('id', id)
      .is('project_id', null);

    // Generate the deposit invoice. Use the first milestone if defined,
    // otherwise fall back to the full proposal total.
    let depositCents = 0;
    let depositLabel = 'Deposit';
    const content =
      (proposal?.content_json ?? null) as ProposalContent | null;
    if (content) {
      const ms = content.investment.milestones ?? [];
      const first = ms.find((m) => m.amount_cents > 0);
      if (first) {
        depositCents = first.amount_cents;
        depositLabel = first.label || 'Deposit';
      } else {
        depositCents = content.investment.total_cents;
        depositLabel = `Project investment — ${proposal?.title ?? 'agreement'}`;
      }
    } else if (proposal?.total_cents != null) {
      depositCents = Number(proposal.total_cents);
    }

    let depositInvoiceId: string | null = null;
    if (depositCents > 0) {
      try {
        const result = await createAndSendInvoice({
          projectId,
          amountCents: depositCents,
          description: `${depositLabel} — ${proposal?.title ?? 'Agreement'}`,
          actorId: null,
          source: 'contract_signed_auto',
        });
        depositInvoiceId = result.invoiceId;
      } catch (err) {
        // Don't block the signature on invoice failure — admin can raise
        // it manually from the project's Invoices tab.
        console.warn('[contract sign] deposit invoice failed:', err);
      }
    }

    // Notify admin that the contract is fully signed.
    const adminId = await getAdminUserId();
    if (adminId) {
      const contractPath = `/admin/projects/${projectId}/contracts/${id}`;
      await notify({
        type: 'contract_signed',
        userId: adminId,
        contractId: id,
        proposalId: r.proposal_id,
        title: proposal?.title ?? 'Contract',
        totalCents:
          proposal?.total_cents == null ? null : Number(proposal.total_cents),
        clientName: contact.full_name,
        signedAt,
        agreementVersion: r.agreement_version,
        contractPath,
      });
    }

    if (projectId) revalidateProject(projectId);

    return Response.json({
      ok: true,
      signed_at: signedAt,
      project_id: projectId,
      deposit_invoice_id: depositInvoiceId,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
