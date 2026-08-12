import 'server-only';

/**
 * Mercury API client — https://docs.mercury.com
 *
 * Read-only by design. Mercury's read-write tokens require IP allowlisting,
 * which Vercel only supports via Static IPs ($100/mo per project on Pro), so
 * the CRM reads banking data and never moves money. Payments stay in Mercury's
 * own dashboard, which also keeps a money-moving token out of an app that
 * contractors and setters sign into.
 *
 * Every request is a plain fetch — Mercury has no SDK worth the dependency.
 */

const BASE_URL = 'https://api.mercury.com/api/v1';

export function mercuryConfigured(): boolean {
  return !!process.env.MERCURY_API_TOKEN;
}

function token(): string {
  const t = process.env.MERCURY_API_TOKEN;
  if (!t) throw new Error('MERCURY_API_TOKEN is not configured');
  return t;
}

/** Mercury reports money as dollars with 2dp; we store integer cents. */
export function toCents(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  // Round after scaling — 19.99 * 100 is 1998.9999… in binary floating point.
  return Math.round(amount * 100);
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
    },
    // Banking data is never served from a cache.
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // Deliberately not echoing the token or full URL into the error.
    throw new Error(`Mercury ${path} failed: ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`);
  }
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------
 * Accounts
 * ------------------------------------------------------------------------- */

export type MercuryAccount = {
  id: string;
  accountNumber: string;
  routingNumber: string;
  name: string;
  nickname: string | null;
  status: 'active' | 'deleted' | 'pending' | 'archived';
  type: 'mercury' | 'external' | 'recipient';
  kind: string;
  legalBusinessName: string;
  createdAt: string;
  availableBalance: number;
  currentBalance: number;
  canReceiveTransactions: boolean | null;
  dashboardLink: string;
};

export async function getAccounts(): Promise<MercuryAccount[]> {
  const data = await request<{ accounts?: MercuryAccount[] }>('/accounts');
  return data.accounts ?? [];
}

/* -------------------------------------------------------------------------
 * Transactions
 * ------------------------------------------------------------------------- */

export type MercuryTransaction = {
  id: string;
  accountId: string;
  /** Signed dollars — debits negative, credits positive. */
  amount: number;
  status: 'pending' | 'sent' | 'cancelled' | 'failed' | 'reversed' | 'blocked';
  kind: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  counterpartyNickname: string | null;
  createdAt: string;
  postedAt: string | null;
  bankDescription: string | null;
  note: string | null;
  externalMemo: string | null;
  mercuryCategory: string | null;
  dashboardLink: string | null;
};

type TransactionPage = {
  transactions?: MercuryTransaction[];
  page?: { nextPage?: string | null; previousPage?: string | null };
};

/** Mercury's per-request ceiling. */
const PAGE_LIMIT = 500;
/** Backstop so a pagination bug can't loop forever against a paid API. */
const MAX_PAGES = 40;

/**
 * Every transaction in a window, following cursor pagination.
 *
 * `start`/`end` filter on createdAt. Pending transactions have no postedAt
 * yet, so syncing on createdAt is what lets them appear and then update once
 * they settle.
 */
export async function listTransactions(opts: {
  start?: string;
  end?: string;
  accountId?: string;
} = {}): Promise<MercuryTransaction[]> {
  const all: MercuryTransaction[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await request<TransactionPage>('/transactions', {
      start: opts.start,
      end: opts.end,
      accountId: opts.accountId,
      limit: PAGE_LIMIT,
      order: 'desc',
      start_after: cursor,
    });
    const batch = data.transactions ?? [];
    all.push(...batch);

    const next = data.page?.nextPage ?? undefined;
    // Stop on a missing cursor, a short page, or a cursor that isn't moving.
    if (!next || next === cursor || batch.length < PAGE_LIMIT) break;
    cursor = next;
  }

  return all;
}
