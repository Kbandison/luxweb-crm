import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';

export type ChangeOrderStatus = 'sent' | 'signed' | 'declined' | 'expired' | 'void';

export type ChangeOrderListRow = {
  id: string;
  number: number;
  title: string;
  status: ChangeOrderStatus;
  amountCents: number;
  timelineWeeks: number;
  sentAt: string;
  signedAt: string | null;
};

export type ChangeOrderDetail = ChangeOrderListRow & {
  projectId: string;
  contractId: string;
  description: string;
  scopeLines: string[];
  billing: 'on_approval' | 'on_signing';
  bodyMd: string;
  bodySha256: string;
  expiresAt: string | null;
  adminSignedName: string;
  adminSignedAt: string;
  signedName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  invoiceState: string;
  invoiceError: string | null;
  invoiceId: string | null;
  milestoneId: string | null;
  creditApplied: { milestone_id: string; from_cents: number; to_cents: number }[];
  creditUnappliedCents: number;
  executedCopySentAt: string | null;
  voidReason: string | null;
  clientName: string;
  clientUserId: string | null;
};

const LIST_COLUMNS = 'id, number, title, status, amount_cents, timeline_weeks, sent_at, signed_at';

type ListRow = {
  id: string;
  number: number;
  title: string;
  status: ChangeOrderStatus;
  amount_cents: number | string;
  timeline_weeks: number;
  sent_at: string;
  signed_at: string | null;
};

function toListRow(r: ListRow): ChangeOrderListRow {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    amountCents: Number(r.amount_cents),
    timelineWeeks: r.timeline_weeks,
    sentAt: r.sent_at,
    signedAt: r.signed_at,
  };
}

/** Every change order on a contract, newest first. */
export async function getChangeOrdersForContract(contractId: string): Promise<ChangeOrderListRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('change_orders')
      .select(LIST_COLUMNS)
      .eq('contract_id', contractId)
      .order('number', { ascending: false });
    return ((data ?? []) as ListRow[]).map(toListRow);
  } catch {
    return [];
  }
}

export async function getChangeOrder(id: string): Promise<ChangeOrderDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('change_orders')
      .select(
        `${LIST_COLUMNS}, project_id, contract_id, description, scope_lines, billing, body_md, body_sha256,
         expires_at, admin_signed_name, admin_signed_at, signed_name, declined_at, decline_reason,
         invoice_state, invoice_error, invoice_id, milestone_id, credit_applied, credit_unapplied_cents,
         executed_copy_sent_at, void_reason, contacts!inner(full_name, user_id)`,
      )
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    type Row = ListRow & {
      project_id: string;
      contract_id: string;
      description: string;
      scope_lines: string[] | null;
      billing: 'on_approval' | 'on_signing';
      body_md: string;
      body_sha256: string;
      expires_at: string | null;
      admin_signed_name: string;
      admin_signed_at: string;
      signed_name: string | null;
      declined_at: string | null;
      decline_reason: string | null;
      invoice_state: string;
      invoice_error: string | null;
      invoice_id: string | null;
      milestone_id: string | null;
      credit_applied: ChangeOrderDetail['creditApplied'] | null;
      credit_unapplied_cents: number | string;
      executed_copy_sent_at: string | null;
      void_reason: string | null;
      contacts: { full_name: string; user_id: string | null } | { full_name: string; user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = flattenJoin(r.contacts);
    return {
      ...toListRow(r),
      projectId: r.project_id,
      contractId: r.contract_id,
      description: r.description,
      scopeLines: r.scope_lines ?? [],
      billing: r.billing,
      bodyMd: r.body_md,
      bodySha256: r.body_sha256,
      expiresAt: r.expires_at,
      adminSignedName: r.admin_signed_name,
      adminSignedAt: r.admin_signed_at,
      signedName: r.signed_name,
      declinedAt: r.declined_at,
      declineReason: r.decline_reason,
      invoiceState: r.invoice_state,
      invoiceError: r.invoice_error,
      invoiceId: r.invoice_id,
      milestoneId: r.milestone_id,
      creditApplied: r.credit_applied ?? [],
      creditUnappliedCents: Number(r.credit_unapplied_cents ?? 0),
      executedCopySentAt: r.executed_copy_sent_at,
      voidReason: r.void_reason,
      clientName: contact?.full_name ?? 'Client',
      clientUserId: contact?.user_id ?? null,
    };
  } catch {
    return null;
  }
}

/** The client's view of one change order — null unless they own it. */
export async function getClientChangeOrder(id: string, userId: string) {
  const co = await getChangeOrder(id);
  if (!co || co.clientUserId !== userId || co.status === 'void') return null;
  return co;
}

/** Change orders on a contract the client owns (withdrawn ones hidden). */
export async function getClientChangeOrdersForContract(
  contractId: string,
  userId: string,
): Promise<ChangeOrderListRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('change_orders')
      .select(`${LIST_COLUMNS}, contacts!inner(user_id)`)
      .eq('contract_id', contractId)
      .neq('status', 'void')
      .order('number', { ascending: false });
    type Row = ListRow & { contacts: { user_id: string | null } | { user_id: string | null }[] };
    return ((data ?? []) as unknown as Row[])
      .filter((r) => flattenJoin(r.contacts)?.user_id === userId)
      .map(toListRow);
  } catch {
    return [];
  }
}

export const CHANGE_ORDER_STATUS_META: Record<ChangeOrderStatus, { label: string; tone: string }> = {
  sent: { label: 'Awaiting signature', tone: 'bg-copper/15 text-copper' },
  signed: { label: 'Signed', tone: 'bg-success/15 text-success' },
  declined: { label: 'Declined', tone: 'bg-danger/10 text-danger' },
  expired: { label: 'Expired', tone: 'bg-warning/15 text-warning' },
  void: { label: 'Withdrawn', tone: 'bg-ink-subtle/10 text-ink-subtle line-through' },
};
