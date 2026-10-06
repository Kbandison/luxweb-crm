import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { createAndSendInvoice } from '@/lib/invoices/create';
import { recordPrepaidInvoice } from '@/lib/invoices/record-prepaid';
import { invoiceDueDays } from '@/lib/contracts/terms';
import {
  collectedPayments,
  depositForSigning,
  milestoneSeedRows,
} from '@/lib/proposals/on-sign';
import type { ProposalContent } from '@/lib/types/proposal';

export type DepositStatus = 'invoiced' | 'collected' | 'none' | 'failed';

type SigningInput = {
  contractId: string;
  contractProjectId: string | null;
  proposalId: string;
  contactId: string;
  clientUserId: string;
  proposal: {
    title: string;
    totalCents: number | null;
    content: ProposalContent | null;
    dealId: string | null;
  };
};

/**
 * Everything that follows the client's signature: find or create the
 * project, seed its milestones from the payment plan, record payments made
 * before signing, and raise the deposit invoice.
 *
 * Not yet atomic — a failure part-way leaves the contract signed with the
 * remaining steps undone (the next PR moves this into a transaction).
 * Ordered so the parts the client is waiting on come first.
 */
export async function completeSigning(input: SigningInput): Promise<{
  projectId: string;
  depositStatus: DepositStatus;
  depositInvoiceId: string | null;
}> {
  const sb = supabaseAdmin();
  const { content } = input.proposal;
  const projectId = await resolveProject(input);

  // Link proposal + contract to the project (covers the just-created case
  // and rows that started contact-scoped on a lead).
  await sb
    .from('proposals')
    .update({ project_id: projectId })
    .eq('id', input.proposalId)
    .is('project_id', null);
  await sb
    .from('contracts')
    .update({ project_id: projectId })
    .eq('id', input.contractId)
    .is('project_id', null);

  const milestoneIdByIndex = await seedMilestones(projectId, content);

  const signedOn = new Date().toISOString().slice(0, 10);
  const title = input.proposal.title || 'Agreement';

  // Money the client paid before the Agreement existed → paid invoices, so
  // Finances and the bank reconciliation can see it.
  for (const payment of collectedPayments(content, signedOn)) {
    try {
      const invoiceId = await recordPrepaidInvoice({
        projectId,
        contactId: input.contactId,
        amountCents: payment.amountCents,
        description: `${payment.label} — ${title}`,
        paidOn: payment.paidOn,
        method: payment.method,
        actorId: input.clientUserId,
      });
      const milestoneId = milestoneIdByIndex.get(payment.milestoneIndex);
      if (milestoneId) {
        await sb.from('milestones').update({ invoice_id: invoiceId }).eq('id', milestoneId);
      }
    } catch (err) {
      console.warn('[contract sign] recording prepaid invoice failed:', err);
    }
  }

  const milestones = content?.investment.milestones ?? [];
  const firstBillable = milestones.findIndex((m) => m.amount_cents > 0);
  const depositCollected =
    firstBillable !== -1 && milestones[firstBillable].collected === true;

  // A collected deposit means work can start now — the Agreement starts the
  // clock on signature + deposit. Done directly rather than through the
  // payment effects, which would run the completion check and fire the
  // "leave us a review" email on a fully prepaid project.
  if (depositCollected) {
    await sb
      .from('projects')
      .update({ status: 'in_progress' })
      .eq('id', projectId)
      .eq('status', 'planning');
    await sb
      .from('deals')
      .update({ stage: 'active', stage_changed_at: new Date().toISOString() })
      .eq('contact_id', input.contactId)
      .in('stage', ['lead', 'discovery', 'proposal']);
  }

  const deposit = depositForSigning(
    content,
    input.proposal.totalCents,
    `Project investment — ${title}`,
  );
  if (!deposit) {
    return {
      projectId,
      depositStatus: depositCollected ? 'collected' : 'none',
      depositInvoiceId: null,
    };
  }

  try {
    const result = await createAndSendInvoice({
      projectId,
      amountCents: deposit.amountCents,
      description: `${deposit.label} — ${title}`,
      // The Agreement says "Net {net_days}"; the invoice has to agree.
      daysUntilDue: invoiceDueDays(content?.investment.net_days),
      actorId: null,
      source: 'contract_signed_auto',
    });
    // Link it to its milestone — that's how the payment knows which
    // milestone it closes.
    const milestoneId =
      deposit.milestoneIndex == null
        ? undefined
        : milestoneIdByIndex.get(deposit.milestoneIndex);
    if (milestoneId) {
      await sb
        .from('milestones')
        .update({ invoice_id: result.invoiceId })
        .eq('id', milestoneId);
    }
    return { projectId, depositStatus: 'invoiced', depositInvoiceId: result.invoiceId };
  } catch (err) {
    // Don't fail the signature over it — but leave a trail in the audit
    // viewer so it doesn't vanish into function logs. Admin can raise it
    // from the project's Invoices tab.
    console.warn('[contract sign] deposit invoice failed:', err);
    await writeAudit({
      actor_id: null,
      action: 'deposit_invoice_failed',
      entity_type: 'contract',
      entity_id: input.contractId,
      diff: {
        project_id: projectId,
        amount_cents: deposit.amountCents,
        message: err instanceof Error ? err.message : String(err),
      },
    });
    return { projectId, depositStatus: 'failed', depositInvoiceId: null };
  }
}

/**
 * Which project this agreement belongs to.
 *
 *   1. The one the contract (or its proposal) is already on.
 *   2. An empty shell project for this contact — still in planning, with no
 *      live contract — when there's exactly one. That's the "created the
 *      project first, wrote the proposal from the lead page" case.
 *   3. Otherwise a new project.
 *
 * It used to grab the contact's most recent project of any kind, so a repeat
 * client's new contract (and its deposit invoice) landed on last year's
 * finished project.
 */
async function resolveProject(input: SigningInput): Promise<string> {
  if (input.contractProjectId) return input.contractProjectId;

  const sb = supabaseAdmin();
  const { data: planning } = await sb
    .from('projects')
    .select('id')
    .eq('contact_id', input.contactId)
    .eq('status', 'planning');
  const planningIds = ((planning ?? []) as { id: string }[]).map((p) => p.id);

  if (planningIds.length > 0) {
    const { data: withContracts } = await sb
      .from('contracts')
      .select('project_id')
      .in('project_id', planningIds)
      .neq('status', 'void');
    const taken = new Set(
      ((withContracts ?? []) as { project_id: string }[]).map((c) => c.project_id),
    );
    const shells = planningIds.filter((id) => !taken.has(id));
    if (shells.length === 1) return shells[0];
  }

  const content = input.proposal.content;
  const { data: created, error } = await sb
    .from('projects')
    .insert({
      name: input.proposal.title || 'New project',
      status: 'planning',
      contact_id: input.contactId,
      deal_id: input.proposal.dealId,
      budget_cents: input.proposal.totalCents,
      end_date: content?.timeline?.target_launch || null,
    })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? 'Failed to create project');
  }
  const projectId = (created as { id: string }).id;
  await writeAudit({
    actor_id: input.clientUserId,
    action: 'create',
    entity_type: 'project',
    entity_id: projectId,
    diff: { contact_id: input.contactId, source: 'contract_signed_auto' },
  });
  return projectId;
}

/**
 * Seed the project's milestones from the proposal's payment plan, unless it
 * already has proposal milestones. Returns proposal index → milestone id so
 * invoices can be linked to the milestone they pay for.
 *
 * Seeding used to happen only when signing created the project, so a
 * proposal written from an existing project's page produced no milestones
 * and its payments advanced nothing.
 */
async function seedMilestones(
  projectId: string,
  content: ProposalContent | null,
): Promise<Map<number, string>> {
  const byIndex = new Map<number, string>();
  const plan = content?.investment?.milestones ?? [];
  if (plan.length === 0) return byIndex;

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('milestones')
    .select('id')
    .eq('project_id', projectId)
    .eq('source', 'proposal')
    .limit(1);
  if ((existing ?? []).length > 0) return byIndex;

  const { data: inserted, error } = await sb
    .from('milestones')
    .insert(milestoneSeedRows(plan, projectId, new Date().toISOString()))
    .select('id, sort_order');
  if (error) {
    console.warn('[contract sign] milestone seeding failed:', error.message);
    return byIndex;
  }
  for (const row of (inserted ?? []) as { id: string; sort_order: number }[]) {
    byIndex.set(row.sort_order, row.id);
  }
  return byIndex;
}
