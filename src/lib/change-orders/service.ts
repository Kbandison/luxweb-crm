import 'server-only';
import { createElement } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { createAndSendInvoice } from '@/lib/invoices/create';
import { invoiceDueDays } from '@/lib/contracts/terms';
import { bodyFingerprint } from '@/lib/contracts/after-sign';
import { renderAgreementPdf } from '@/lib/contracts/pdf';
import { contractorPartyFor } from '@/lib/contracts/party';
import { CURRENT_AGREEMENT_VERSION } from '@/lib/contracts/versions';
import { renderSignatureParty } from '@/lib/contracts/render';
import { notify, getAdminUserIds, getContactUserId } from '@/lib/notifications';
import { sendEmail } from '@/lib/resend';
import AgreementExecutedEmail, {
  agreementExecutedSubject,
} from '@/emails/agreement-executed-email';
import { flattenJoin } from '@/lib/array-join';
import { formatUSD } from '@/lib/formatters';
import type { ProposalContent } from '@/lib/types/proposal';
import { allocateCredit, type CreditTarget } from './credits';
import { alertBillingBlocked, checkAutomaticInvoice } from './billing';
import {
  changeOrderVariables,
  renderChangeOrderBody,
  type ChangeOrderDraft,
} from './render';

/* -------------------------------------------------------------------------
 * The agreement being amended
 * ------------------------------------------------------------------------- */

export type Amendable = {
  contractId: string;
  projectId: string;
  contactId: string;
  projectTitle: string;
  agreementSignedAt: string;
  agreementVersion: string;
  content: ProposalContent;
  /** Agreement total plus every change order already signed. */
  currentTotalCents: number;
  nextNumber: number;
};

/** A signed agreement, ready to take a change order — or null. */
export async function loadAmendable(contractId: string): Promise<Amendable | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('contracts')
    .select(
      'id, status, project_id, contact_id, signed_at, agreement_version, content_snapshot, proposals!inner(title, total_cents, content_json)',
    )
    .eq('id', contractId)
    .maybeSingle();
  type Row = {
    id: string;
    status: string;
    project_id: string | null;
    contact_id: string;
    signed_at: string | null;
    agreement_version: string;
    content_snapshot: ProposalContent | null;
    proposals:
      | { title: string; total_cents: number | string | null; content_json: ProposalContent | null }
      | { title: string; total_cents: number | string | null; content_json: ProposalContent | null }[];
  };
  const c = data as unknown as Row | null;
  if (!c || c.status !== 'signed' || !c.project_id || !c.signed_at) return null;
  const proposal = flattenJoin(c.proposals);
  const content = c.content_snapshot ?? proposal?.content_json ?? null;
  if (!content) return null;

  const { data: orders } = await sb
    .from('change_orders')
    .select('number, status, amount_cents')
    .eq('contract_id', contractId);
  const rows = (orders ?? []) as { number: number; status: string; amount_cents: number | string }[];
  const agreementTotal = Number(content.investment?.total_cents ?? proposal?.total_cents ?? 0);

  return {
    contractId: c.id,
    projectId: c.project_id,
    contactId: c.contact_id,
    projectTitle: proposal?.title ?? 'Project',
    agreementSignedAt: c.signed_at,
    agreementVersion: c.agreement_version.replace(/^v/i, ''),
    content,
    currentTotalCents:
      agreementTotal +
      rows.filter((r) => r.status === 'signed').reduce((s, r) => s + Number(r.amount_cents), 0),
    nextNumber: rows.reduce((max, r) => Math.max(max, r.number), 0) + 1,
  };
}

export async function renderChangeOrder(amendable: Amendable, draft: ChangeOrderDraft, number: number) {
  const variables = changeOrderVariables(draft, {
    number,
    projectTitle: amendable.projectTitle,
    agreementSignedAt: amendable.agreementSignedAt,
    agreementContent: amendable.content,
    previousTotalCents: amendable.currentTotalCents,
    netDays: amendable.content.investment?.net_days ?? 7,
  });
  const bodyMd = await renderChangeOrderBody(variables);
  return { bodyMd, variables };
}

/* -------------------------------------------------------------------------
 * Create & send (the studio signs)
 * ------------------------------------------------------------------------- */

export async function createAndSendChangeOrder(opts: {
  contractId: string;
  draft: ChangeOrderDraft;
  sender: { userId: string; name: string; ip: string | null; userAgent: string | null };
  expiresInDays: number;
}): Promise<
  { ok: true; id: string; number: number; projectId: string } | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  // Two tries: a change order sent at the same moment can take the number.
  for (let attempt = 0; attempt < 2; attempt++) {
    const amendable = await loadAmendable(opts.contractId);
    if (!amendable) return { ok: false, error: 'Only a signed agreement can take a change order.' };
    const number = amendable.nextNumber;
    const { bodyMd } = await renderChangeOrder(amendable, opts.draft, number);
    const now = new Date();
    const amount = Math.round(opts.draft.amountCents);

    const { data, error } = await sb
      .from('change_orders')
      .insert({
        contract_id: amendable.contractId,
        project_id: amendable.projectId,
        contact_id: amendable.contactId,
        number,
        title: opts.draft.title.trim(),
        description: opts.draft.description.trim(),
        scope_lines: opts.draft.scopeLines.map((l) => l.trim()).filter(Boolean),
        amount_cents: amount,
        timeline_weeks: Math.trunc(opts.draft.timelineWeeks),
        billing: opts.draft.billing,
        status: 'sent',
        body_md: bodyMd,
        body_sha256: bodyFingerprint(bodyMd),
        sent_at: now.toISOString(),
        expires_at: new Date(now.getTime() + opts.expiresInDays * 86_400_000).toISOString(),
        admin_signed_name: opts.sender.name,
        admin_signed_at: now.toISOString(),
        admin_signed_ip: opts.sender.ip,
        admin_signed_user_agent: opts.sender.userAgent,
        created_by: opts.sender.userId,
      })
      .select('id, expires_at')
      .single();

    if (error) {
      if (/change_orders_contract_id_number_key/.test(error.message) && attempt === 0) continue;
      return { ok: false, error: error.message };
    }
    const id = (data as { id: string }).id;
    await writeAudit({
      actor_id: opts.sender.userId,
      action: 'send',
      entity_type: 'change_order',
      entity_id: id,
      diff: { number, amount_cents: amount, contract_id: amendable.contractId, signed_by_studio: opts.sender.name },
    });

    const clientUserId = await getContactUserId(amendable.contactId);
    if (clientUserId) {
      await notify({
        type: 'change_order',
        kind: 'ready',
        userId: clientUserId,
        changeOrderId: id,
        clientName: amendable.content.client.name,
        number,
        title: opts.draft.title.trim(),
        amountCents: amount,
        expiresAt: (data as { expires_at: string | null }).expires_at,
        path: `/portal/change-orders/${id}`,
      });
    }
    return { ok: true, id, number, projectId: amendable.projectId };
  }
  return { ok: false, error: 'Could not number the change order — try again.' };
}

/* -------------------------------------------------------------------------
 * The client signs
 * ------------------------------------------------------------------------- */

type ChangeOrderRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  amount_cents: number | string;
  billing: 'on_approval' | 'on_signing';
  project_id: string;
  contact_id: string;
  contract_id: string;
};

/** "$1,000 · On approval" → "$700 · On approval · $300 credit, change order #2" */
function creditedDescription(original: string | null, toCents: number, takeCents: number, number: number): string {
  const rest = (original ?? '').split(' · ').slice(1).join(' · ');
  return [
    `$${(toCents / 100).toFixed(toCents % 100 === 0 ? 0 : 2)}`,
    rest,
    `${formatUSD(takeCents)} credit, change order #${number}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function signChangeOrder(opts: {
  changeOrderId: string;
  clientUserId: string;
  signature: { name: string; ip: string | null; userAgent: string | null; signedAt: string };
}): Promise<
  | { ok: true; invoiceId: string | null; projectId: string; unappliedCreditCents: number }
  | { ok: false; reason: 'not_open' }
> {
  const sb = supabaseAdmin();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await sb
      .from('change_orders')
      .select('id, number, title, status, amount_cents, billing, project_id, contact_id, contract_id')
      .eq('id', opts.changeOrderId)
      .maybeSingle();
    const co = data as ChangeOrderRow | null;
    if (!co || co.status !== 'sent') return { ok: false, reason: 'not_open' };
    const amount = Number(co.amount_cents);

    let milestone: { title: string; description: string; amount_cents: number } | null = null;
    let credits: { milestone_id: string; from_cents: number; to_cents: number; description: string }[] = [];
    let unapplied = 0;

    if (amount > 0) {
      const onSigning = co.billing === 'on_signing';
      milestone = {
        title: `Change order #${co.number}: ${co.title}`,
        description: onSigning
          ? `${formatUSD(amount)} · Billed on signing · Change order #${co.number}`
          : `${formatUSD(amount)} · On approval · Change order #${co.number}`,
        // Billed on signing → the invoice is raised now and the milestone
        // carries nothing more to bill; approval completes it.
        amount_cents: onSigning ? 0 : amount,
      };
    } else if (amount < 0) {
      const { data: ms } = await sb
        .from('milestones')
        .select('id, title, description, amount_cents, invoice_id, status, sort_order, source')
        .eq('project_id', co.project_id);
      const rows = (ms ?? []) as (CreditTarget & { description: string | null })[];
      const allocation = allocateCredit(rows, -amount);
      unapplied = allocation.unappliedCents;
      credits = allocation.lines.map((line) => ({
        ...line,
        description: creditedDescription(
          rows.find((r) => r.id === line.milestone_id)?.description ?? null,
          line.to_cents,
          line.from_cents - line.to_cents,
          co.number,
        ),
      }));
    }

    const { data: result, error } = await sb.rpc('sign_change_order', {
      p: {
        change_order_id: co.id,
        signed_at: opts.signature.signedAt,
        signed_name: opts.signature.name,
        signed_ip: opts.signature.ip,
        signed_user_agent: opts.signature.userAgent,
        milestone,
        credits,
        credit_unapplied_cents: unapplied,
        invoice_state: amount > 0 && co.billing === 'on_signing' ? 'pending' : 'not_required',
      },
    });
    if (error) {
      // A credited payment was billed between reading and signing — redo it.
      if (/credit_target_changed/.test(error.message) && attempt === 0) continue;
      if (/agreement_not_signed/.test(error.message)) return { ok: false, reason: 'not_open' };
      throw new Error(error.message);
    }
    if (!(result as { ok: boolean }).ok) return { ok: false, reason: 'not_open' };

    await writeAudit({
      actor_id: opts.clientUserId,
      action: 'sign',
      entity_type: 'change_order',
      entity_id: co.id,
      diff: {
        signed_name: opts.signature.name,
        ip: opts.signature.ip,
        user_agent: opts.signature.userAgent,
        signed_at: opts.signature.signedAt,
        amount_cents: amount,
        credits,
        credit_unapplied_cents: unapplied,
      },
    });

    let invoiceId: string | null = null;
    if (amount > 0 && co.billing === 'on_signing') {
      invoiceId = (await raiseChangeOrderInvoice(co.id)).invoiceId;
    }
    return { ok: true, invoiceId, projectId: co.project_id, unappliedCreditCents: unapplied };
  }
  throw new Error('The project payments changed while signing — please try again.');
}

/* -------------------------------------------------------------------------
 * Billed on signing
 * ------------------------------------------------------------------------- */

const STALE_RUNNING_MS = 10 * 60 * 1000;

/**
 * Raise the invoice for a change order billed on signing — once (claimed on
 * invoice_state, like a deposit), inside the overcharge guard, on the
 * agreement's Net terms.
 */
export async function raiseChangeOrderInvoice(
  changeOrderId: string,
): Promise<{ state: string; invoiceId: string | null }> {
  const sb = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data: claimed } = await sb
    .from('change_orders')
    .update({ invoice_state: 'running', invoice_attempted_at: new Date().toISOString() })
    .eq('id', changeOrderId)
    .eq('status', 'signed')
    .or(
      `invoice_state.in.(pending,failed),and(invoice_state.eq.running,invoice_attempted_at.lt.${staleBefore})`,
    )
    .select(
      'id, number, title, amount_cents, project_id, contract_id, contacts!inner(full_name), contracts!inner(content_snapshot)',
    );
  type Row = {
    id: string;
    number: number;
    title: string;
    amount_cents: number | string;
    project_id: string;
    contract_id: string;
    contacts: { full_name: string } | { full_name: string }[];
    contracts: { content_snapshot: ProposalContent | null } | { content_snapshot: ProposalContent | null }[];
  };
  const row = (claimed ?? [])[0] as unknown as Row | undefined;
  if (!row) {
    const { data } = await sb
      .from('change_orders')
      .select('invoice_state, invoice_id')
      .eq('id', changeOrderId)
      .maybeSingle();
    const cur = data as { invoice_state: string; invoice_id: string | null } | null;
    return { state: cur?.invoice_state ?? 'not_required', invoiceId: cur?.invoice_id ?? null };
  }

  const amount = Number(row.amount_cents);
  const label = `Change order #${row.number}: ${row.title}`;
  const path = `/admin/projects/${row.project_id}/change-orders/${row.id}`;
  const clientName = flattenJoin(row.contacts)?.full_name ?? 'A client';
  try {
    const fits = await checkAutomaticInvoice(row.project_id, amount);
    if (!fits.ok) {
      await alertBillingBlocked({ contractId: row.contract_id, clientName, title: label, message: fits.message, path });
      throw new Error(fits.message);
    }
    const content = flattenJoin(row.contracts)?.content_snapshot ?? null;
    const invoice = await createAndSendInvoice({
      projectId: row.project_id,
      amountCents: amount,
      description: label,
      daysUntilDue: invoiceDueDays(content?.investment?.net_days),
      actorId: null,
      source: 'change_order_signed',
    });
    await sb
      .from('change_orders')
      .update({ invoice_state: 'invoiced', invoice_id: invoice.invoiceId, invoice_error: null })
      .eq('id', row.id);
    return { state: 'invoiced', invoiceId: invoice.invoiceId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sb
      .from('change_orders')
      .update({ invoice_state: 'failed', invoice_error: message })
      .eq('id', row.id);
    await writeAudit({
      actor_id: null,
      action: 'invoice_failed',
      entity_type: 'change_order',
      entity_id: row.id,
      diff: { message },
    });
    if (!message.startsWith('Blocked:')) {
      const adminIds = await getAdminUserIds();
      await Promise.all(
        adminIds.map((userId) =>
          notify({
            type: 'deposit_invoice_failed',
            userId,
            contractId: row.contract_id,
            clientName,
            title: label,
            message,
            contractPath: path,
            problem: "the change order invoice didn't go out",
          }),
        ),
      );
    }
    return { state: 'failed', invoiceId: null };
  }
}

/* -------------------------------------------------------------------------
 * Executed copy
 * ------------------------------------------------------------------------- */

export async function loadChangeOrderCopy(changeOrderId: string) {
  const { data } = await supabaseAdmin()
    .from('change_orders')
    .select(
      `id, number, title, status, body_md, body_sha256, project_id,
       signed_name, signed_at, signed_ip, signed_user_agent,
       admin_signed_name, admin_signed_at, admin_signed_ip, admin_signed_user_agent,
       contacts!inner(full_name, email, user_id),
       contracts!inner(agreement_version, content_snapshot)`,
    )
    .eq('id', changeOrderId)
    .maybeSingle();
  if (!data) return null;
  type Contact = { full_name: string; email: string | null; user_id: string | null };
  type Contract = { agreement_version: string; content_snapshot: ProposalContent | null };
  type Row = {
    id: string;
    number: number;
    title: string;
    status: string;
    body_md: string;
    body_sha256: string;
    project_id: string;
    signed_name: string | null;
    signed_at: string | null;
    signed_ip: string | null;
    signed_user_agent: string | null;
    admin_signed_name: string;
    admin_signed_at: string;
    admin_signed_ip: string | null;
    admin_signed_user_agent: string | null;
    contacts: Contact | Contact[];
    contracts: Contract | Contract[];
  };
  const r = data as unknown as Row;
  const contact = flattenJoin(r.contacts);
  const contract = flattenJoin(r.contracts);
  const version = (contract?.agreement_version ?? '').replace(/^v/i, '');
  const title = `Change order #${r.number}: ${r.title}`;
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
      documentLabel: `Change order #${r.number}`,
      bodyMd: r.body_md,
      bodySha256: r.body_sha256,
      // Signed today, so by today's entity — even when it amends an
      // agreement executed before the studio incorporated.
      contractor: {
        party: contractorPartyFor(CURRENT_AGREEMENT_VERSION),
        name: r.admin_signed_name,
        signedAt: r.admin_signed_at,
        ip: r.admin_signed_ip,
        userAgent: r.admin_signed_user_agent,
      },
      client: {
        party: contract?.content_snapshot
          ? renderSignatureParty(contract.content_snapshot)
          : contact?.full_name ?? 'Client',
        name: r.signed_name,
        signedAt: r.signed_at,
        ip: r.signed_ip,
        userAgent: r.signed_user_agent,
      },
    },
  };
}

const STUDIO_INBOX = process.env.ADMIN_NOTIFICATIONS_EMAIL ?? 'alerts@luxwebstudio.dev';

/** Email the signed change order (PDF) to the client and the studio — once. */
export async function sendChangeOrderExecutedCopy(changeOrderId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await sb
    .from('change_orders')
    .update({ executed_copy_sent_at: claimedAt })
    .eq('id', changeOrderId)
    .eq('status', 'signed')
    .is('executed_copy_sent_at', null)
    .select('id');
  if ((claimed ?? []).length === 0) return false;
  try {
    const copy = await loadChangeOrderCopy(changeOrderId);
    if (!copy) throw new Error('Change order not found');
    const pdf = await renderAgreementPdf(copy.pdfInput);
    const filename = `luxweb-change-order-${copy.pdfInput.documentLabel.replace(/\D+/g, '')}.pdf`;
    const attachments = [{ filename, content: pdf }];
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
    const common = { title: copy.title, clientName: copy.clientName, bodySha256: copy.bodySha256, documentNoun: 'change order' as const };
    if (copy.clientEmail) {
      const props = { ...common, recipientName: copy.clientName, audience: 'client' as const, agreementUrl: `${base}/portal/change-orders/${changeOrderId}` };
      await sendEmail({
        to: copy.clientEmail,
        subject: agreementExecutedSubject(props),
        react: createElement(AgreementExecutedEmail, props),
        tag: 'change_order_executed',
        category: 'update',
        attachments,
      });
    }
    const studio = { ...common, recipientName: 'LuxWeb', audience: 'studio' as const, agreementUrl: `${base}/admin/projects/${copy.projectId}/change-orders/${changeOrderId}` };
    await sendEmail({
      to: STUDIO_INBOX,
      subject: agreementExecutedSubject(studio),
      react: createElement(AgreementExecutedEmail, studio),
      tag: 'change_order_executed',
      category: 'admin',
      attachments,
    });
    return true;
  } catch (err) {
    console.warn('[change order] executed copy failed:', err);
    await sb
      .from('change_orders')
      .update({ executed_copy_sent_at: null })
      .eq('id', changeOrderId)
      .eq('executed_copy_sent_at', claimedAt);
    return false;
  }
}
