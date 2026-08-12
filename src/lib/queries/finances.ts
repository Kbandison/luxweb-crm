import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Read queries for the banking mirror. All fail soft. */

export type BankAccountRow = {
  id: string;
  name: string;
  nickname: string | null;
  last4: string | null;
  availableCents: number;
  currentCents: number;
  dashboardLink: string | null;
  syncedAt: string | null;
};

export type BankTransactionRow = {
  id: string;
  accountId: string | null;
  amountCents: number;
  status: string;
  kind: string | null;
  counterpartyName: string | null;
  description: string | null;
  mercuryCategory: string | null;
  category: string | null;
  dashboardLink: string | null;
  postedAt: string | null;
  createdAt: string;
  reconciledAt: string | null;
};

export async function getBankAccounts(): Promise<BankAccountRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('bank_accounts')
      .select('*')
      .eq('status', 'active')
      .order('current_balance_cents', { ascending: false });
    return ((data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      nickname: (a.nickname as string | null) ?? null,
      last4: (a.account_number_last4 as string | null) ?? null,
      availableCents: Number(a.available_balance_cents ?? 0),
      currentCents: Number(a.current_balance_cents ?? 0),
      dashboardLink: (a.dashboard_link as string | null) ?? null,
      syncedAt: (a.synced_at as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

function mapTx(t: Record<string, unknown>): BankTransactionRow {
  return {
    id: t.id as string,
    accountId: (t.account_id as string | null) ?? null,
    amountCents: Number(t.amount_cents ?? 0),
    status: t.status as string,
    kind: (t.kind as string | null) ?? null,
    counterpartyName: (t.counterparty_name as string | null) ?? null,
    description:
      (t.external_memo as string | null) ||
      (t.bank_description as string | null) ||
      (t.note as string | null) ||
      null,
    mercuryCategory: (t.mercury_category as string | null) ?? null,
    category: (t.category as string | null) ?? null,
    dashboardLink: (t.dashboard_link as string | null) ?? null,
    postedAt: (t.posted_at as string | null) ?? null,
    createdAt: t.created_at as string,
    reconciledAt: (t.reconciled_at as string | null) ?? null,
  };
}

/**
 * Recent transactions, newest first. Failed and cancelled rows are excluded —
 * they never moved money and would distort the totals beside them.
 */
export async function getBankTransactions(
  opts: { limit?: number; since?: string } = {},
): Promise<BankTransactionRow[]> {
  try {
    let q = supabaseAdmin()
      .from('bank_transactions')
      .select('*')
      .not('status', 'in', '(failed,cancelled)');
    if (opts.since) q = q.gte('created_at', opts.since);
    const { data } = await q
      .order('created_at', { ascending: false })
      .limit(opts.limit ?? 100);
    return ((data ?? []) as Record<string, unknown>[]).map(mapTx);
  } catch {
    return [];
  }
}

export type CashSummary = {
  totalAvailableCents: number;
  totalCurrentCents: number;
  monthInCents: number;
  monthOutCents: number;
  /** Money in minus money out, this calendar month. */
  monthNetCents: number;
  pendingCount: number;
  lastSyncedAt: string | null;
};

function startOfMonthUtc(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Cash position plus this month's flow.
 *
 * Flow counts *settled* money only (`posted_at` set): a pending debit hasn't
 * left the account yet, and counting it would make the month look worse than
 * the balance shows.
 */
export async function getCashSummary(): Promise<CashSummary> {
  const empty: CashSummary = {
    totalAvailableCents: 0,
    totalCurrentCents: 0,
    monthInCents: 0,
    monthOutCents: 0,
    monthNetCents: 0,
    pendingCount: 0,
    lastSyncedAt: null,
  };
  try {
    const sb = supabaseAdmin();
    const [{ data: accounts }, { data: txs }] = await Promise.all([
      sb.from('bank_accounts').select('available_balance_cents, current_balance_cents, synced_at').eq('status', 'active'),
      sb
        .from('bank_transactions')
        .select('amount_cents, status, posted_at')
        .gte('created_at', startOfMonthUtc())
        .not('status', 'in', '(failed,cancelled)'),
    ]);

    const out = { ...empty };
    for (const a of (accounts ?? []) as Record<string, unknown>[]) {
      out.totalAvailableCents += Number(a.available_balance_cents ?? 0);
      out.totalCurrentCents += Number(a.current_balance_cents ?? 0);
      const synced = a.synced_at as string | null;
      if (synced && (!out.lastSyncedAt || synced > out.lastSyncedAt)) {
        out.lastSyncedAt = synced;
      }
    }

    for (const t of (txs ?? []) as Record<string, unknown>[]) {
      const cents = Number(t.amount_cents ?? 0);
      if (t.status === 'pending' || !t.posted_at) {
        out.pendingCount += 1;
        continue;
      }
      if (cents >= 0) out.monthInCents += cents;
      else out.monthOutCents += Math.abs(cents);
    }
    out.monthNetCents = out.monthInCents - out.monthOutCents;
    return out;
  } catch {
    return empty;
  }
}
