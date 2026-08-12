import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  getAccounts,
  listTransactions,
  mercuryConfigured,
  toCents,
  type MercuryTransaction,
} from './client';
import { listApprovalRequests, paymentsEnabled } from './payments';

/**
 * Pull Mercury into `crm.bank_accounts` / `crm.bank_transactions`.
 *
 * Upserts, never deletes: Mercury owns the banking columns and overwrites them
 * each run, while the CRM-owned columns (category, invoice_id, team_member_id,
 * reconciled_at, crm_note) are simply left out of the payload so a re-sync
 * can't wipe a categorization or a reconciliation.
 *
 * Re-syncing a window is therefore safe and idempotent, which matters because
 * pending transactions change — they arrive with no postedAt and settle later.
 */

/** How far back a routine sync looks. Long enough to catch late settlement. */
const DEFAULT_LOOKBACK_DAYS = 45;

export type SyncResult = {
  accounts: number;
  transactions: number;
  /** Queued payouts whose approval state changed. */
  payouts: number;
  since: string;
};

/** Mercury's approval vocabulary → our payment_requests.status. */
const APPROVAL_STATUS: Record<string, string> = {
  pendingApproval: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

/**
 * Pull approval outcomes back for payouts still shown as in-flight.
 *
 * Best-effort: a banking sync must not fail because the payouts feature is
 * misconfigured or switched off mid-flight.
 */
async function syncPayoutStatuses(): Promise<number> {
  if (!paymentsEnabled()) return 0;
  try {
    const sb = supabaseAdmin();
    const { data: pending } = await sb
      .from('payment_requests')
      .select('id, mercury_request_id')
      .eq('status', 'submitted')
      .not('mercury_request_id', 'is', null);
    const rows = (pending ?? []) as { id: string; mercury_request_id: string }[];
    if (rows.length === 0) return 0;

    const remote = new Map(
      (await listApprovalRequests()).map((r) => [r.requestId, r.status]),
    );
    let changed = 0;
    for (const row of rows) {
      const next = APPROVAL_STATUS[remote.get(row.mercury_request_id) ?? ''];
      // Unknown or unchanged — leave it alone.
      if (!next || next === 'submitted') continue;
      await sb
        .from('payment_requests')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      changed += 1;
    }
    return changed;
  } catch {
    return 0;
  }
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function mapTransaction(t: MercuryTransaction): Record<string, unknown> {
  return {
    id: t.id,
    account_id: t.accountId,
    amount_cents: toCents(t.amount),
    status: t.status,
    kind: t.kind ?? null,
    counterparty_name: t.counterpartyNickname || t.counterpartyName || null,
    counterparty_id: t.counterpartyId ?? null,
    bank_description: t.bankDescription ?? null,
    note: t.note ?? null,
    external_memo: t.externalMemo ?? null,
    mercury_category: t.mercuryCategory ?? null,
    dashboard_link: t.dashboardLink ?? null,
    posted_at: t.postedAt ?? null,
    created_at: t.createdAt,
    synced_at: new Date().toISOString(),
  };
}

export async function syncMercury(
  opts: { sinceDays?: number } = {},
): Promise<SyncResult> {
  if (!mercuryConfigured()) throw new Error('Mercury is not connected.');
  const sb = supabaseAdmin();
  const since = isoDaysAgo(opts.sinceDays ?? DEFAULT_LOOKBACK_DAYS);

  // --- Accounts -----------------------------------------------------------
  const accounts = await getAccounts();
  const accountRows = accounts
    // 'external' and 'recipient' entries are counterparties, not our money.
    .filter((a) => a.type === 'mercury')
    .map((a) => ({
      id: a.id,
      name: a.name,
      nickname: a.nickname ?? null,
      kind: a.kind ?? null,
      type: a.type,
      status: a.status,
      // Last four only — see the migration's note on why.
      account_number_last4: a.accountNumber ? a.accountNumber.slice(-4) : null,
      available_balance_cents: toCents(a.availableBalance),
      current_balance_cents: toCents(a.currentBalance),
      dashboard_link: a.dashboardLink ?? null,
      synced_at: new Date().toISOString(),
    }));

  if (accountRows.length > 0) {
    const { error } = await sb
      .from('bank_accounts')
      .upsert(accountRows, { onConflict: 'id' });
    if (error) throw new Error(`Account sync failed: ${error.message}`);
  }

  // --- Transactions -------------------------------------------------------
  const known = new Set(accountRows.map((a) => a.id));
  const transactions = (await listTransactions({ start: since }))
    // A transaction against an account we didn't mirror would violate the FK.
    .filter((t) => known.has(t.accountId));

  let written = 0;
  // Chunked so a busy month doesn't build one enormous statement.
  const CHUNK = 200;
  for (let i = 0; i < transactions.length; i += CHUNK) {
    const chunk = transactions.slice(i, i + CHUNK).map(mapTransaction);
    const { error } = await sb
      .from('bank_transactions')
      .upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`Transaction sync failed: ${error.message}`);
    written += chunk.length;
  }

  const payouts = await syncPayoutStatuses();

  return { accounts: accountRows.length, transactions: written, payouts, since };
}
