import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { billingCheck } from './guard';
import type { ProposalContent } from '@/lib/types/proposal';

export type ContractBilling = {
  contractId: string;
  /** Signed agreement total + signed change orders (credits negative). */
  contractedCents: number;
  /** Invoices raised for agreement and change-order payments (not void). */
  contractBilledCents: number;
  /** Every invoice on the project that isn't void, manual ones included. */
  allBilledCents: number;
};

/**
 * Where a project stands against its signed agreement. Null when the project
 * has no signed agreement — nothing to guard.
 */
export async function projectContractBilling(projectId: string): Promise<ContractBilling | null> {
  const sb = supabaseAdmin();
  const { data: contract } = await sb
    .from('contracts')
    .select('id, content_snapshot, proposals!inner(total_cents, content_json)')
    .eq('project_id', projectId)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!contract) return null;

  type Row = {
    id: string;
    content_snapshot: ProposalContent | null;
    proposals:
      | { total_cents: number | string | null; content_json: ProposalContent | null }
      | { total_cents: number | string | null; content_json: ProposalContent | null }[];
  };
  const c = contract as unknown as Row;
  const proposal = flattenJoin(c.proposals);
  const agreementTotal = Number(
    c.content_snapshot?.investment?.total_cents ??
      proposal?.content_json?.investment?.total_cents ??
      proposal?.total_cents ??
      0,
  );

  const [{ data: orders }, { data: invoices }, { data: milestones }] = await Promise.all([
    sb.from('change_orders').select('amount_cents, invoice_id').eq('contract_id', c.id).eq('status', 'signed'),
    sb.from('invoices').select('id, amount_cents, status').eq('project_id', projectId).neq('status', 'void'),
    sb
      .from('milestones')
      .select('invoice_id, source')
      .eq('project_id', projectId)
      .not('invoice_id', 'is', null),
  ]);

  const signedOrders = (orders ?? []) as { amount_cents: number | string; invoice_id: string | null }[];
  const live = (invoices ?? []) as { id: string; amount_cents: number | string }[];
  const contractInvoiceIds = new Set<string>([
    ...((milestones ?? []) as { invoice_id: string; source: string | null }[])
      .filter((m) => m.source === 'proposal' || m.source === 'change_order' || m.source === null)
      .map((m) => m.invoice_id),
    ...signedOrders.flatMap((o) => (o.invoice_id ? [o.invoice_id] : [])),
  ]);

  return {
    contractId: c.id,
    contractedCents: agreementTotal + signedOrders.reduce((s, o) => s + Number(o.amount_cents), 0),
    contractBilledCents: live
      .filter((i) => contractInvoiceIds.has(i.id))
      .reduce((s, i) => s + Number(i.amount_cents), 0),
    allBilledCents: live.reduce((s, i) => s + Number(i.amount_cents), 0),
  };
}

/**
 * The overcharge guard for invoices the system raises on its own — deposits,
 * phase payments, change-order work. Ok when there's no signed agreement.
 */
export async function checkAutomaticInvoice(
  projectId: string,
  amountCents: number,
): Promise<{ ok: true } | { ok: false; message: string; contractId: string }> {
  const billing = await projectContractBilling(projectId);
  if (!billing) return { ok: true };
  const check = billingCheck({
    contractedCents: billing.contractedCents,
    billedCents: billing.contractBilledCents,
    amountCents,
  });
  if (check.ok) return { ok: true };
  const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return {
    ok: false,
    contractId: billing.contractId,
    message:
      `Blocked: this ${usd(amountCents)} invoice would bill ${usd(check.overByCents)} past the ` +
      `contract (${usd(billing.contractedCents)} agreed incl. change orders, ` +
      `${usd(billing.contractBilledCents)} already billed).`,
  };
}

/** Tell the studio an automatic invoice was blocked, and why. */
export async function alertBillingBlocked(opts: {
  contractId: string;
  clientName: string;
  title: string;
  message: string;
  path: string;
}): Promise<void> {
  const adminIds = await getAdminUserIds();
  await Promise.all(
    adminIds.map((userId) =>
      notify({ type: 'contract_billing_blocked', userId, ...opts }),
    ),
  );
}
