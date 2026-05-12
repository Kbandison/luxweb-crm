/**
 * Shared offset-based pagination + sort helpers for admin list pages.
 *
 * The URL is the source of truth — back/forward, sharing, and bookmarking
 * all work because each list state is a query string:
 *   ?page=1&sort=created_at&dir=desc&q=foo
 *
 * Sort columns are whitelisted by each query so user input can't be smuggled
 * into the ORDER BY clause.
 */

export type SortDir = 'asc' | 'desc';

export type ListParams = {
  /** 1-indexed page number. */
  page: number;
  /** Rows per page, clamped to [1, 100]. */
  pageSize: number;
  /** Whitelisted column to sort by. */
  sort: string;
  /** Sort direction. */
  dir: SortDir;
  /** Free-text search term (trimmed, or null). */
  q: string | null;
};

export type ParseListOptions = {
  /** Column used when no `?sort=` is present or the value isn't allowed. */
  defaultSort: string;
  /** Whitelist of column names the user is allowed to sort by. */
  allowedSorts: readonly string[];
  /** Defaults to 25. Clamped to [1, 100]. */
  defaultPageSize?: number;
};

const MAX_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const DEFAULT_PAGE_SIZE = 25;

function firstValue(
  v: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function toInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Parse + sanitize URL search params into a `ListParams` object. Always
 * returns valid values — anything out of range is clamped, and sort columns
 * not present in `allowedSorts` fall back to `defaultSort`.
 */
export function parseListParams(
  searchParams: Record<string, string | string[] | undefined>,
  opts: ParseListOptions,
): ListParams {
  const defaultPageSize = opts.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  const page = Math.max(1, toInt(firstValue(searchParams.page), 1));
  const pageSize = clamp(
    toInt(firstValue(searchParams.pageSize), defaultPageSize),
    MIN_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );

  const requestedSort = firstValue(searchParams.sort);
  const sort =
    requestedSort && opts.allowedSorts.includes(requestedSort)
      ? requestedSort
      : opts.defaultSort;

  const requestedDir = firstValue(searchParams.dir);
  const dir: SortDir = requestedDir === 'asc' ? 'asc' : 'desc';

  const rawQ = firstValue(searchParams.q);
  const trimmed = typeof rawQ === 'string' ? rawQ.trim() : '';
  const q = trimmed.length > 0 ? trimmed : null;

  return { page, pageSize, sort, dir, q };
}

/**
 * Minimal shape of the PostgREST builder methods we need. Kept structural so
 * we don't have to pin to a generic of `PostgrestFilterBuilder<...>` and so
 * `getCount`-style helpers don't fight TS in the call sites.
 */
type Orderable<T> = {
  order(column: string, opts: { ascending: boolean }): T;
  range(from: number, to: number): T;
};

/**
 * Apply `.order(...)` and `.range(...)` from the parsed params onto a
 * Supabase query builder. Returns the same builder, narrowed to its self type
 * so chained calls (e.g. `.then(...)`) keep their type.
 */
export function applyListParams<T extends Orderable<T>>(
  query: T,
  params: ListParams,
): T {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;
  return query
    .order(params.sort, { ascending: params.dir === 'asc' })
    .range(from, to);
}

/**
 * Helper for building hrefs that preserve unrelated query params while
 * updating a subset. Pass `null` to remove a key. Returns the search portion
 * (without the leading `?`) — caller stitches it onto the pathname.
 */
export function buildListSearch(
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) next.append(k, item);
    } else {
      next.append(k, v);
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  // Drop default `page=1` to keep URLs tidy.
  if (next.get('page') === '1') next.delete('page');
  return next.toString();
}

/** Convenience: total pages for a given total count + page size. */
export function totalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
