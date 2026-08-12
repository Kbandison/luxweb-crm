import 'server-only';
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { inferCategory, isInternalTransfer } from '@/lib/finances/categories';
import {
  suggestMatches,
  type Candidate,
  type MatchSuggestion,
} from '@/lib/finances/reconcile';

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
  teamMemberId: string | null;
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
    teamMemberId: (t.team_member_id as string | null) ?? null,
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

/**
 * Transactions for the last `months` calendar months, deduped per request.
 *
 * The cash summary and the P&L both need this window — the summary only cares
 * about the current month, but reading the wider window once and narrowing in
 * memory means one query instead of two overlapping ones. React's `cache`
 * collapses the calls within a single render.
 */
const loadTransactionWindow = cache(async (months: number) => {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  try {
    const { data } = await supabaseAdmin()
      .from('bank_transactions')
      .select('amount_cents, status, kind, mercury_category, category, posted_at, created_at')
      .gte('created_at', since.toISOString())
      .not('status', 'in', '(failed,cancelled)');
    return (data ?? []) as Record<string, unknown>[];
  } catch {
    return [] as Record<string, unknown>[];
  }
});

/** Months of history the finance page reads. */
export const FINANCE_WINDOW_MONTHS = 6;

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
    // Compared as instants, not strings: Postgres renders '+00:00' where JS
    // renders 'Z', so a lexicographic compare drops a transaction landing
    // exactly on the boundary.
    const monthStartMs = new Date(startOfMonthUtc()).getTime();
    const [{ data: accounts }, windowRows] = await Promise.all([
      supabaseAdmin()
        .from('bank_accounts')
        .select('available_balance_cents, current_balance_cents, synced_at')
        .eq('status', 'active'),
      loadTransactionWindow(FINANCE_WINDOW_MONTHS),
    ]);
    // Narrow the shared window to this month rather than re-querying for it.
    const txs = windowRows.filter((t) => {
      const created = new Date(String(t.created_at ?? '')).getTime();
      return Number.isFinite(created) && created >= monthStartMs;
    });

    const out = { ...empty };
    for (const a of (accounts ?? []) as Record<string, unknown>[]) {
      out.totalAvailableCents += Number(a.available_balance_cents ?? 0);
      out.totalCurrentCents += Number(a.current_balance_cents ?? 0);
      const synced = a.synced_at as string | null;
      if (synced && (!out.lastSyncedAt || synced > out.lastSyncedAt)) {
        out.lastSyncedAt = synced;
      }
    }

    for (const t of txs) {
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

/* -------------------------------------------------------------------------
 * Profit & loss
 * ------------------------------------------------------------------------- */

export type MonthlyPnL = {
  /** 'YYYY-MM' */
  month: string;
  /** Settled deposits, excluding transfers between the studio's own accounts. */
  cashInCents: number;
  /** Settled outgoing, same exclusion. */
  expensesCents: number;
  netCents: number;
  /** What was billed and paid, per the CRM's invoices. */
  invoicedCents: number;
  byCategory: Array<{ category: string; cents: number }>;
  /** Outgoing money we couldn't categorize — needs a human. */
  uncategorizedCents: number;
  uncategorizedCount: number;
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Cash-basis P&L by month.
 *
 * Cash in / expenses come from the bank (what actually moved), while
 * `invoicedCents` comes from paid invoices. The two rarely match and both are
 * shown on purpose: Stripe takes its cut before depositing and pays out in
 * batches, so banked cash trails invoiced revenue in both size and timing.
 *
 * Internal transfers are excluded — see isInternalTransfer for why that's
 * essential with an envelope account setup.
 */
export async function getMonthlyPnL(months = 6): Promise<MonthlyPnL[]> {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  const sinceIso = since.toISOString();

  try {
    const [txs, { data: invoices }] = await Promise.all([
      loadTransactionWindow(months),
      supabaseAdmin()
        .from('invoices')
        .select('amount_cents, paid_at')
        .eq('status', 'paid')
        .gte('paid_at', sinceIso),
    ]);

    const buckets = new Map<string, MonthlyPnL>();
    const catTotals = new Map<string, Map<string, number>>();

    const bucket = (m: string): MonthlyPnL => {
      let b = buckets.get(m);
      if (!b) {
        b = {
          month: m,
          cashInCents: 0,
          expensesCents: 0,
          netCents: 0,
          invoicedCents: 0,
          byCategory: [],
          uncategorizedCents: 0,
          uncategorizedCount: 0,
        };
        buckets.set(m, b);
        catTotals.set(m, new Map());
      }
      return b;
    };

    for (const t of txs) {
      // Unsettled money hasn't happened yet.
      const posted = t.posted_at as string | null;
      if (!posted) continue;
      const kind = (t.kind as string | null) ?? null;
      if (isInternalTransfer(kind)) continue;

      const m = monthKey(posted);
      const b = bucket(m);
      const cents = Number(t.amount_cents ?? 0);

      if (cents >= 0) {
        b.cashInCents += cents;
        continue;
      }

      const spend = Math.abs(cents);
      b.expensesCents += spend;
      const category = inferCategory({
        category: (t.category as string | null) ?? null,
        kind,
        mercuryCategory: (t.mercury_category as string | null) ?? null,
      });
      if (category) {
        const cats = catTotals.get(m)!;
        cats.set(category, (cats.get(category) ?? 0) + spend);
      } else {
        b.uncategorizedCents += spend;
        b.uncategorizedCount += 1;
      }
    }

    for (const inv of (invoices ?? []) as Record<string, unknown>[]) {
      const paidAt = inv.paid_at as string | null;
      if (!paidAt) continue;
      bucket(monthKey(paidAt)).invoicedCents += Number(inv.amount_cents ?? 0);
    }

    for (const [m, b] of buckets) {
      b.netCents = b.cashInCents - b.expensesCents;
      b.byCategory = [...(catTotals.get(m) ?? new Map())]
        .map(([category, cents]) => ({ category, cents }))
        .sort((a, b2) => b2.cents - a.cents);
    }

    return [...buckets.values()].sort((a, b) => b.month.localeCompare(a.month));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Payout requests
 * ------------------------------------------------------------------------- */

export type PaymentRequestRow = {
  id: string;
  amountCents: number;
  recipientName: string | null;
  paymentMethod: string;
  status: string;
  memo: string | null;
  mercuryRequestId: string | null;
  error: string | null;
  submittedAt: string | null;
  createdAt: string;
};

/** Payouts queued from the CRM, newest first. */
export async function getPaymentRequests(limit = 25): Promise<PaymentRequestRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      amountCents: Number(r.amount_cents ?? 0),
      recipientName: (r.recipient_name as string | null) ?? null,
      paymentMethod: (r.payment_method as string | null) ?? 'ach',
      status: (r.status as string | null) ?? 'draft',
      memo: (r.memo as string | null) ?? null,
      mercuryRequestId: (r.mercury_request_id as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Reconciliation
 * ------------------------------------------------------------------------- */

export type ReconciledInvoice = {
  invoiceId: string;
  amountCents: number;
  label: string;
};

export type DepositToReconcile = {
  transactionId: string;
  amountCents: number;
  counterpartyName: string | null;
  postedAt: string | null;
  matched: ReconciledInvoice[];
  /** Gross of the matched invoices; differs from the deposit by the fee. */
  matchedGrossCents: number;
  suggestions: MatchSuggestion[];
};

/** A paid invoice, labelled for the matcher. */
async function loadOpenInvoices(taken: Set<string>): Promise<Map<string, Candidate>> {
  const out = new Map<string, Candidate>();
  try {
    const { data: invoices } = await supabaseAdmin()
      .from('invoices')
      .select('id, amount_cents, paid_at, contacts!inner(full_name)')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(200);
    for (const inv of (invoices ?? []) as Record<string, unknown>[]) {
      const id = inv.id as string;
      if (taken.has(id)) continue; // already accounted for by another deposit
      const contact = inv.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const name = Array.isArray(contact) ? contact[0]?.full_name : contact?.full_name;
      out.set(id, {
        invoiceId: id,
        amountCents: Number(inv.amount_cents ?? 0),
        paidAt: (inv.paid_at as string | null) ?? null,
        label: name ?? 'Invoice',
      });
    }
  } catch {
    /* no candidates */
  }
  return out;
}

/**
 * Incoming deposits with their matches, plus suggestions for the unmatched.
 *
 * Only settled, non-internal money in: a transfer between the studio's own
 * accounts never paid an invoice, and pending cash hasn't arrived.
 */
export async function getDepositsToReconcile(limit = 30): Promise<DepositToReconcile[]> {
  try {
    const sb = supabaseAdmin();
    // One read of the links table, used for both the existing matches and to
    // exclude already-attributed invoices from the candidate pool.
    const [{ data: txs }, { data: links }] = await Promise.all([
      sb
        .from('bank_transactions')
        .select('id, amount_cents, counterparty_name, kind, posted_at')
        .gt('amount_cents', 0)
        .not('posted_at', 'is', null)
        .not('status', 'in', '(failed,cancelled)')
        .order('posted_at', { ascending: false })
        .limit(limit),
      sb.from('invoice_reconciliations').select('transaction_id, invoice_id, amount_cents'),
    ]);

    const linkRows = (links ?? []) as Record<string, unknown>[];
    const candidates = await loadOpenInvoices(
      new Set(linkRows.map((l) => l.invoice_id as string)),
    );

    const byTx = new Map<string, ReconciledInvoice[]>();
    for (const l of linkRows) {
      const t = l.transaction_id as string;
      const list = byTx.get(t) ?? [];
      list.push({
        invoiceId: l.invoice_id as string,
        amountCents: Number(l.amount_cents ?? 0),
        label: 'Invoice',
      });
      byTx.set(t, list);
    }

    const pool = [...candidates.values()];

    return ((txs ?? []) as Record<string, unknown>[])
      .filter((t) => !isInternalTransfer((t.kind as string | null) ?? null))
      .map((t) => {
        const id = t.id as string;
        const amountCents = Number(t.amount_cents ?? 0);
        const matched = byTx.get(id) ?? [];
        return {
          transactionId: id,
          amountCents,
          counterpartyName: (t.counterparty_name as string | null) ?? null,
          postedAt: (t.posted_at as string | null) ?? null,
          matched,
          matchedGrossCents: matched.reduce((s, m) => s + m.amountCents, 0),
          suggestions: matched.length > 0 ? [] : suggestMatches(amountCents, pool),
        };
      });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Payout ledger — what each person has earned vs. what they've been paid
 * ------------------------------------------------------------------------- */

export type PayoutLedgerRow = {
  teamMemberId: string;
  name: string;
  rateType: string | null;
  rateCents: number | null;
  /** Logged hours × rate. Hourly members only — see note below. */
  earnedTimeCents: number;
  hours: number;
  /** Commission on won appointments they booked. */
  earnedCommissionCents: number;
  earnedTotalCents: number;
  /** Settled money out attributed to this person. */
  paidCents: number;
  balanceCents: number;
  /** True when we can't derive earnings — a fixed-rate arrangement. */
  manualOnly: boolean;
};

/**
 * What the studio owes each team member, against what's actually left the bank.
 *
 * Earned comes from two places the CRM already tracks: logged hours × the
 * member's rate, and commission on won appointments they booked. Paid comes
 * from bank transactions attributed to them — actual money out, not what was
 * queued, so a payout made directly in Mercury still counts.
 *
 * Fixed-rate members are flagged `manualOnly`: their cost isn't a function of
 * hours, so inferring it from time logs would be fiction. Their paid column is
 * still accurate.
 */
export async function getPayoutLedger(): Promise<PayoutLedgerRow[]> {
  try {
    const sb = supabaseAdmin();
    const [{ data: members }, { data: logs }, { data: appts }, { data: paid }] =
      await Promise.all([
        sb
          .from('team_members')
          .select('id, full_name, user_id, rate_cents, rate_type, status')
          .eq('status', 'active'),
        sb.from('time_logs').select('hours, team_member_id').not('team_member_id', 'is', null),
        sb
          .from('appointments')
          .select('setter_id, commission_cents')
          .eq('result', 'won'),
        sb
          .from('bank_transactions')
          .select('amount_cents, team_member_id, kind, posted_at, status')
          .not('team_member_id', 'is', null)
          .lt('amount_cents', 0)
          .not('status', 'in', '(failed,cancelled)'),
      ]);

    const rows = (members ?? []) as Record<string, unknown>[];
    // Commission is keyed by the setter's user id; the ledger is keyed by
    // team member, so bridge the two.
    const memberByUser = new Map<string, string>();
    for (const m of rows) {
      const uid = m.user_id as string | null;
      if (uid) memberByUser.set(uid, m.id as string);
    }

    const hoursBy = new Map<string, number>();
    for (const l of (logs ?? []) as Record<string, unknown>[]) {
      const id = l.team_member_id as string;
      hoursBy.set(id, (hoursBy.get(id) ?? 0) + Number(l.hours ?? 0));
    }

    const commissionBy = new Map<string, number>();
    for (const a of (appts ?? []) as Record<string, unknown>[]) {
      const uid = a.setter_id as string | null;
      const memberId = uid ? memberByUser.get(uid) : undefined;
      if (!memberId) continue;
      commissionBy.set(
        memberId,
        (commissionBy.get(memberId) ?? 0) + Number(a.commission_cents ?? 0),
      );
    }

    const paidBy = new Map<string, number>();
    for (const t of (paid ?? []) as Record<string, unknown>[]) {
      // Only settled, real outgoing money — an envelope transfer isn't a payout.
      if (!t.posted_at) continue;
      if (isInternalTransfer((t.kind as string | null) ?? null)) continue;
      const id = t.team_member_id as string;
      paidBy.set(id, (paidBy.get(id) ?? 0) + Math.abs(Number(t.amount_cents ?? 0)));
    }

    return rows
      .map((m) => {
        const id = m.id as string;
        const rateCents = m.rate_cents as number | null;
        const rateType = (m.rate_type as string | null) ?? 'hourly';
        const hours = hoursBy.get(id) ?? 0;
        const manualOnly = rateType !== 'hourly' || rateCents == null;
        const earnedTime = manualOnly ? 0 : Math.round(hours * (rateCents ?? 0));
        const earnedCommission = commissionBy.get(id) ?? 0;
        const paidCents = paidBy.get(id) ?? 0;
        const earnedTotalCents = earnedTime + earnedCommission;
        return {
          teamMemberId: id,
          name: (m.full_name as string) ?? 'Unknown',
          rateType,
          rateCents,
          earnedTimeCents: earnedTime,
          hours,
          earnedCommissionCents: earnedCommission,
          earnedTotalCents,
          paidCents,
          balanceCents: earnedTotalCents - paidCents,
          manualOnly,
        };
      })
      .filter((r) => r.earnedTotalCents > 0 || r.paidCents > 0 || r.hours > 0)
      .sort((a, b) => b.balanceCents - a.balanceCents);
  } catch {
    return [];
  }
}

/** Active team members, for attributing a payment to someone. */
export async function getPayableMembers(): Promise<Array<{ id: string; name: string }>> {
  try {
    const { data } = await supabaseAdmin()
      .from('team_members')
      .select('id, full_name')
      .eq('status', 'active')
      .order('full_name');
    return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      name: (m.full_name as string) ?? 'Unknown',
    }));
  } catch {
    return [];
  }
}
