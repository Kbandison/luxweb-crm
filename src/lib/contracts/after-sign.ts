import 'server-only';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { createAndSendInvoice } from '@/lib/invoices/create';
import { invoiceDueDays } from '@/lib/contracts/terms';
import { renderAgreementPdf, type PdfSigner } from '@/lib/contracts/pdf';
import { contractorPartyFor } from '@/lib/contracts/party';
import { depositForSigning, signingPlan } from '@/lib/proposals/on-sign';
import { notify, getAdminUserIds, getContactUserId } from '@/lib/notifications';
import { sendEmail } from '@/lib/resend';
import AgreementExecutedEmail, {
  agreementExecutedSubject,
} from '@/emails/agreement-executed-email';
import { clientParty, type ProposalContent } from '@/lib/types/proposal';
import { flattenJoin } from '@/lib/array-join';

export type DepositState =
  | 'not_required'
  | 'collected'
  | 'pending'
  | 'running'
  | 'invoiced'
  | 'failed';

/** SHA-256 of the frozen body — the fingerprint both parties sign. */
export function bodyFingerprint(bodyMd: string): string {
  return createHash('sha256').update(bodyMd, 'utf8').digest('hex');
}

/* -------------------------------------------------------------------------
 * Signing
 * ------------------------------------------------------------------------- */

type SignInput = {
  contractId: string;
  clientUserId: string;
  contactId: string;
  contractProjectId: string | null;
  signature: { name: string; ip: string | null; userAgent: string | null; signedAt: string };
  proposal: { title: string; totalCents: number | null; dealId: string | null };
  /** The agreement as sent (contract.content_snapshot). */
  content: ProposalContent;
};

export type SignResult =
  | { ok: true; projectId: string; depositState: DepositState; depositInvoiceId: string | null }
  | { ok: false; reason: 'already_signed' | 'not_open' };

/**
 * Apply a client's signature. The contract, the agreement's accepted state,
 * the project, its milestones, and any payments made before signing are
 * written in ONE transaction (crm.complete_signing) — either all of it
 * lands or none of it does, and only one submit can win.
 *
 * The deposit invoice can't be part of that transaction (it's a Stripe
 * call), so it runs right after, tracked on the contract's deposit_state
 * so a failure is visible, alerted, and retryable.
 */
export async function signAgreement(input: SignInput): Promise<SignResult> {
  const sb = supabaseAdmin();
  const plan = signingPlan(input.content, {
    title: input.proposal.title,
    totalCents: input.proposal.totalCents,
    signedAt: input.signature.signedAt,
  });
  const existingProjectId =
    input.contractProjectId ?? (await findShellProject(input.contactId));

  const { data, error } = await sb.rpc('complete_signing', {
    p: {
      contract_id: input.contractId,
      signed_at: input.signature.signedAt,
      signed_name: input.signature.name,
      signed_ip: input.signature.ip,
      signed_user_agent: input.signature.userAgent,
      deposit_state: plan.depositState,
      project_id: existingProjectId,
      new_project: {
        name: input.proposal.title || 'New project',
        deal_id: input.proposal.dealId,
        budget_cents: input.proposal.totalCents,
        end_date: input.content.timeline?.target_launch || null,
      },
      milestones: plan.milestones,
      prepaid: plan.prepaid,
      start_now: plan.startNow,
    },
  });
  if (error) {
    if (/agreement_not_open/.test(error.message)) return { ok: false, reason: 'not_open' };
    throw new Error(error.message);
  }
  const result = data as
    | { ok: true; project_id: string; prepaid_invoice_ids: string[] }
    | { ok: false; reason: string };
  if (!result.ok) return { ok: false, reason: 'already_signed' };

  const projectId = result.project_id;

  // Audit trail for what the transaction created.
  await writeAudit({
    actor_id: input.clientUserId,
    action: 'sign',
    entity_type: 'contract',
    entity_id: input.contractId,
    diff: {
      signed_name: input.signature.name,
      ip: input.signature.ip,
      user_agent: input.signature.userAgent,
      signed_at: input.signature.signedAt,
      by: 'client',
      project_id: projectId,
      deposit_state: plan.depositState,
    },
  });
  if (!existingProjectId) {
    await writeAudit({
      actor_id: input.clientUserId,
      action: 'create',
      entity_type: 'project',
      entity_id: projectId,
      diff: { contact_id: input.contactId, source: 'contract_signed_auto' },
    });
  }
  for (const [i, invoiceId] of result.prepaid_invoice_ids.entries()) {
    await writeAudit({
      actor_id: input.clientUserId,
      action: 'create',
      entity_type: 'invoice',
      entity_id: invoiceId,
      diff: {
        status: 'paid',
        paid_at: plan.prepaid[i]?.paid_at,
        amount_cents: plan.prepaid[i]?.amount_cents,
        method: plan.prepaid[i]?.method,
        source: 'collected_before_signing',
      },
    });
  }

  if (plan.depositState !== 'pending') {
    return { ok: true, projectId, depositState: plan.depositState, depositInvoiceId: null };
  }
  const deposit = await raiseDeposit(input.contractId);
  return { ok: true, projectId, depositState: deposit.state, depositInvoiceId: deposit.invoiceId };
}

/**
 * The contact's one empty shell project — still in planning, no live
 * contract — when there's exactly one. That's the "created the project
 * first, wrote the agreement from the lead page" case. Anything else gets a
 * new project, so a repeat client's agreement never lands on an old one.
 */
async function findShellProject(contactId: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: planning } = await sb
    .from('projects')
    .select('id')
    .eq('contact_id', contactId)
    .eq('status', 'planning');
  const ids = ((planning ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return null;
  const { data: taken } = await sb
    .from('contracts')
    .select('project_id')
    .in('project_id', ids)
    .neq('status', 'void');
  const used = new Set(((taken ?? []) as { project_id: string }[]).map((c) => c.project_id));
  const shells = ids.filter((id) => !used.has(id));
  return shells.length === 1 ? shells[0] : null;
}

/* -------------------------------------------------------------------------
 * Deposit invoice
 * ------------------------------------------------------------------------- */

/** A 'running' claim older than this is treated as abandoned (crashed mid-call). */
const STALE_RUNNING_MS = 10 * 60 * 1000;

/**
 * Raise the deposit invoice for a signed contract — once. Claims the
 * contract's deposit_state ('pending' or 'failed' → 'running') so two calls
 * can't both create an invoice, then records the outcome. On failure, the
 * studio is alerted and the contract page offers Finish setup to retry.
 */
export async function raiseDeposit(
  contractId: string,
): Promise<{ state: DepositState; invoiceId: string | null }> {
  const sb = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data: claimed } = await sb
    .from('contracts')
    .update({ deposit_state: 'running', deposit_attempted_at: new Date().toISOString() })
    .eq('id', contractId)
    .eq('status', 'signed')
    .or(
      `deposit_state.in.(pending,failed),and(deposit_state.eq.running,deposit_attempted_at.lt.${staleBefore})`,
    )
    .select(
      'id, project_id, contact_id, content_snapshot, proposals!inner(title, total_cents, content_json), contacts!inner(full_name)',
    );
  const row = (claimed ?? [])[0] as
    | {
        id: string;
        project_id: string | null;
        contact_id: string;
        content_snapshot: ProposalContent | null;
        proposals:
          | { title: string; total_cents: number | null; content_json: ProposalContent | null }
          | { title: string; total_cents: number | null; content_json: ProposalContent | null }[];
        contacts: { full_name: string } | { full_name: string }[];
      }
    | undefined;

  if (!row) {
    // Someone else has it, or there's nothing to do — report where it stands.
    const { data } = await sb
      .from('contracts')
      .select('deposit_state, deposit_invoice_id')
      .eq('id', contractId)
      .maybeSingle();
    const current = data as { deposit_state: DepositState | null; deposit_invoice_id: string | null } | null;
    return { state: current?.deposit_state ?? 'not_required', invoiceId: current?.deposit_invoice_id ?? null };
  }

  const proposal = flattenJoin(row.proposals);
  const content = row.content_snapshot ?? proposal?.content_json ?? null;
  const title = proposal?.title || 'Agreement';
  const deposit = depositForSigning(
    content,
    proposal?.total_cents == null ? null : Number(proposal.total_cents),
    `Project investment — ${title}`,
  );

  try {
    if (!row.project_id) throw new Error('Signed contract has no project');
    if (!deposit) {
      await sb
        .from('contracts')
        .update({ deposit_state: 'not_required', deposit_error: null })
        .eq('id', contractId);
      return { state: 'not_required', invoiceId: null };
    }

    const invoice = await createAndSendInvoice({
      projectId: row.project_id,
      amountCents: deposit.amountCents,
      description: `${deposit.label} — ${title}`,
      // The Agreement says "Net {net_days}"; the invoice has to agree.
      daysUntilDue: invoiceDueDays(content?.investment.net_days),
      actorId: null,
      source: 'contract_signed_auto',
    });

    // Link it to its milestone — that's how the payment knows which
    // milestone it closes.
    if (deposit.milestoneIndex != null) {
      await sb
        .from('milestones')
        .update({ invoice_id: invoice.invoiceId })
        .eq('project_id', row.project_id)
        .eq('source', 'proposal')
        .eq('sort_order', deposit.milestoneIndex)
        .is('invoice_id', null);
    }
    await sb
      .from('contracts')
      .update({
        deposit_state: 'invoiced',
        deposit_invoice_id: invoice.invoiceId,
        deposit_error: null,
      })
      .eq('id', contractId);
    return { state: 'invoiced', invoiceId: invoice.invoiceId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[agreement] deposit invoice failed:', message);
    await sb
      .from('contracts')
      .update({ deposit_state: 'failed', deposit_error: message })
      .eq('id', contractId);
    await writeAudit({
      actor_id: null,
      action: 'deposit_invoice_failed',
      entity_type: 'contract',
      entity_id: contractId,
      diff: { message },
    });
    const clientName = flattenJoin(row.contacts)?.full_name ?? 'A client';
    const adminIds = await getAdminUserIds();
    await Promise.all(
      adminIds.map((userId) =>
        notify({
          type: 'deposit_invoice_failed',
          userId,
          contractId,
          clientName,
          title,
          message,
          contractPath: row.project_id
            ? `/admin/projects/${row.project_id}/contracts/${contractId}`
            : `/admin/contracts/${contractId}`,
        }),
      ),
    );
    return { state: 'failed', invoiceId: null };
  }
}

/* -------------------------------------------------------------------------
 * Executed copy
 * ------------------------------------------------------------------------- */

/** The CLIENT signature line, as printed in the Agreement. */
function clientPartyLabel(content: ProposalContent | null, fallbackName: string): string {
  if (!content) return fallbackName;
  const party = clientParty(content);
  const person = content.client.name || fallbackName;
  if (party.kind !== 'business' || !party.business_name?.trim()) return person;
  return `${party.business_name}, by ${person}${party.signer_title ? `, ${party.signer_title}` : ''}`;
}

/** Load a contract with everything the executed PDF prints. */
export async function loadExecutedCopy(contractId: string) {
  const { data } = await supabaseAdmin()
    .from('contracts')
    .select(
      `id, status, agreement_version, body_md, body_sha256, project_id, content_snapshot,
       signed_name, signed_at, signed_ip, signed_user_agent,
       admin_signed_name, admin_signed_at, admin_signed_ip, admin_signed_user_agent,
       proposals!inner(title), contacts!inner(full_name, email, user_id)`,
    )
    .eq('id', contractId)
    .maybeSingle();
  if (!data) return null;
  type Contact = { full_name: string; email: string | null; user_id: string | null };
  type Row = {
    id: string;
    status: string;
    agreement_version: string;
    body_md: string;
    body_sha256: string | null;
    project_id: string | null;
    content_snapshot: ProposalContent | null;
    signed_name: string | null;
    signed_at: string | null;
    signed_ip: string | null;
    signed_user_agent: string | null;
    admin_signed_name: string | null;
    admin_signed_at: string | null;
    admin_signed_ip: string | null;
    admin_signed_user_agent: string | null;
    proposals: { title: string } | { title: string }[];
    contacts: Contact | Contact[];
  };
  const r = data as unknown as Row;
  const contact = flattenJoin(r.contacts);
  const version = r.agreement_version.replace(/^v/i, '');
  const title = flattenJoin(r.proposals)?.title ?? 'Agreement';
  const contractor: PdfSigner = {
    party: contractorPartyFor(version),
    name: r.admin_signed_name,
    signedAt: r.admin_signed_at,
    ip: r.admin_signed_ip,
    userAgent: r.admin_signed_user_agent,
  };
  const client: PdfSigner = {
    party: clientPartyLabel(r.content_snapshot, contact?.full_name ?? 'Client'),
    name: r.signed_name,
    signedAt: r.signed_at,
    ip: r.signed_ip,
    userAgent: r.signed_user_agent,
  };
  return {
    status: r.status,
    projectId: r.project_id,
    title,
    clientName: contact?.full_name ?? 'Client',
    clientEmail: contact?.email ?? null,
    clientUserId: contact?.user_id ?? null,
    bodySha256: r.body_sha256,
    pdfInput: {
      title,
      agreementVersion: version,
      bodyMd: r.body_md,
      bodySha256: r.body_sha256,
      contractor,
      client,
    },
  };
}

export function executedCopyFilename(title: string, version: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `luxweb-agreement-${slug || 'signed'}-v${version}.pdf`;
}

const STUDIO_INBOX = process.env.ADMIN_NOTIFICATIONS_EMAIL ?? 'alerts@luxwebstudio.dev';

/**
 * Email the fully signed agreement, as a PDF, to the client and to the
 * studio inbox — once. Claims executed_copy_sent_at first so a retry (or a
 * second trigger) can't send it twice; releases the claim if sending fails
 * so Finish setup can try again.
 */
export async function sendExecutedCopy(contractId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await sb
    .from('contracts')
    .update({ executed_copy_sent_at: claimedAt })
    .eq('id', contractId)
    .eq('status', 'signed')
    .is('executed_copy_sent_at', null)
    .select('id');
  if ((claimed ?? []).length === 0) return false;

  try {
    const copy = await loadExecutedCopy(contractId);
    if (!copy) throw new Error('Contract not found');
    const pdf = await renderAgreementPdf(copy.pdfInput);
    const attachments = [
      { filename: executedCopyFilename(copy.title, copy.pdfInput.agreementVersion), content: pdf },
    ];
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

    // The signed record goes to the client regardless of email preferences —
    // it's their copy of a contract, not a notification.
    if (copy.clientEmail) {
      const props = {
        recipientName: copy.clientName,
        title: copy.title,
        audience: 'client' as const,
        clientName: copy.clientName,
        bodySha256: copy.bodySha256,
        agreementUrl: `${base}/portal/contracts/${contractId}`,
      };
      await sendEmail({
        to: copy.clientEmail,
        subject: agreementExecutedSubject(props),
        react: createElement(AgreementExecutedEmail, props),
        tag: 'agreement_executed',
        category: 'update',
        attachments,
      });
    }
    const studioProps = {
      recipientName: 'LuxWeb',
      title: copy.title,
      audience: 'studio' as const,
      clientName: copy.clientName,
      bodySha256: copy.bodySha256,
      agreementUrl: copy.projectId
        ? `${base}/admin/projects/${copy.projectId}/contracts/${contractId}`
        : `${base}/admin/contracts/${contractId}`,
    };
    await sendEmail({
      to: STUDIO_INBOX,
      subject: agreementExecutedSubject(studioProps),
      react: createElement(AgreementExecutedEmail, studioProps),
      tag: 'agreement_executed',
      category: 'admin',
      attachments,
    });
    return true;
  } catch (err) {
    console.warn('[agreement] executed copy failed:', err);
    await sb
      .from('contracts')
      .update({ executed_copy_sent_at: null })
      .eq('id', contractId)
      .eq('executed_copy_sent_at', claimedAt);
    return false;
  }
}

/* -------------------------------------------------------------------------
 * Withdrawing
 * ------------------------------------------------------------------------- */

/**
 * Void every unsigned contract on an agreement — when it's revised,
 * declined, or expires — and optionally tell the client the link they have
 * no longer works. Returns the voided contract ids.
 */
export async function withdrawUnsigned(opts: {
  proposalId: string;
  reason: string;
  actorId: string | null;
  notifyClient: boolean;
}): Promise<string[]> {
  const sb = supabaseAdmin();
  const voidedAt = new Date().toISOString();
  const { data } = await sb
    .from('contracts')
    .update({
      status: 'void',
      voided_at: voidedAt,
      voided_by: opts.actorId,
      void_reason: opts.reason,
    })
    .eq('proposal_id', opts.proposalId)
    .in('status', ['pending_client_signature', 'pending_signature', 'pending_admin_signature'])
    .select('id, contact_id, project_id, proposals!inner(title)');
  type Row = {
    id: string;
    contact_id: string;
    project_id: string | null;
    proposals: { title: string } | { title: string }[];
  };
  const rows = (data ?? []) as unknown as Row[];

  for (const row of rows) {
    await writeAudit({
      actor_id: opts.actorId,
      action: 'void',
      entity_type: 'contract',
      entity_id: row.id,
      diff: { reason: opts.reason, voided_at: voidedAt, proposal_id: opts.proposalId },
    });
    if (opts.notifyClient) {
      await notifyClientOfWithdrawal({
        contractId: row.id,
        proposalId: opts.proposalId,
        contactId: row.contact_id,
        projectId: row.project_id,
        title: flattenJoin(row.proposals)?.title ?? 'your project',
        reason: opts.reason,
        wasSigned: false,
      });
    }
  }
  return rows.map((r) => r.id);
}

export async function notifyClientOfWithdrawal(opts: {
  contractId: string;
  proposalId: string;
  contactId: string;
  projectId: string | null;
  title: string;
  reason: string;
  wasSigned: boolean;
}): Promise<void> {
  const userId = await getContactUserId(opts.contactId);
  if (!userId) return;
  await notify({
    type: 'agreement_withdrawn',
    userId,
    proposalId: opts.proposalId,
    contractId: opts.contractId,
    title: opts.title,
    reason: opts.reason,
    wasSigned: opts.wasSigned,
    portalPath: opts.projectId ? `/portal/project/${opts.projectId}` : '/portal/dashboard',
  });
}
