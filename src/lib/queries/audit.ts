import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { flattenJoin } from '@/lib/array-join';
export { ENTITY_TYPES, ACTIONS } from '@/lib/audit-meta';

export type AuditFilters = {
  entityType?: string;
  action?: string;
  actorEmail?: string;
  from?: string; // ISO date (inclusive)
  to?: string;   // ISO date (inclusive)
  page?: number;
  pageSize?: number;
};

export type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditPage = {
  entries: AuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DAY_MS = 86_400_000;

/**
 * The UTC instant of midnight America/New_York on a YYYY-MM-DD date. The
 * from/to filters (and the quick-filter presets) are studio-timezone days;
 * handed to Postgres bare they'd mean UTC midnight, 4–5 hours off.
 */
function studioMidnightIso(ymd: string, addDays = 0): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const utcMidnight = Date.parse(`${ymd}T00:00:00Z`) + addDays * DAY_MS;
  if (!Number.isFinite(utcMidnight)) return null;
  // NY's offset at that instant (DST-aware): read its wall clock and diff.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(utcMidnight))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
  );
  return new Date(utcMidnight + (utcMidnight - wall)).toISOString();
}

export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;
  const empty: AuditPage = { entries: [], page, pageSize, total: 0, totalPages: 1 };

  try {
    // Actor email is a joined column, so resolve it to user ids first and
    // filter in the query — filtering after .range() only searched the
    // current page and left the total counting every actor.
    let actorIds: string[] | null = null;
    const needle = filters.actorEmail?.trim();
    if (needle) {
      const escaped = needle.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { data: users } = await supabaseAdmin()
        .from('users')
        .select('id')
        .ilike('email', `%${escaped}%`);
      actorIds = ((users ?? []) as { id: string }[]).map((u) => u.id);
      if (actorIds.length === 0) return empty;
    }

    let q = supabaseAdmin()
      .from('audit_log')
      .select(
        'id, action, entity_type, entity_id, actor_id, diff, created_at, users!audit_log_actor_id_fkey(email, full_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    if (filters.entityType) q = q.eq('entity_type', filters.entityType);
    if (filters.action) q = q.eq('action', filters.action);
    if (actorIds) q = q.in('actor_id', actorIds);
    const fromIso = filters.from ? studioMidnightIso(filters.from) : null;
    if (fromIso) q = q.gte('created_at', fromIso);
    // Inclusive upper bound — next day's midnight, so "to=2026-04-13" means
    // "through end of 04-13".
    const toIso = filters.to ? studioMidnightIso(filters.to, 1) : null;
    if (toIso) q = q.lt('created_at', toIso);

    const { data, count } = await q.range(offset, offset + pageSize - 1);

    type Row = {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      actor_id: string | null;
      diff: Record<string, unknown> | null;
      created_at: string;
      users:
        | { email: string | null; full_name: string | null }
        | { email: string | null; full_name: string | null }[]
        | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const entries = rows.map((r) => {
      const u = flattenJoin(r.users);
      return {
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actorId: r.actor_id,
        actorEmail: u?.email ?? null,
        actorName: u?.full_name ?? null,
        diff: r.diff,
        createdAt: r.created_at,
      };
    });

    const total = count ?? entries.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { entries, page, pageSize, total, totalPages };
  } catch {
    return empty;
  }
}
