import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
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


export async function getAuditLog(filters: AuditFilters = {}): Promise<AuditPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  try {
    let q = supabaseAdmin()
      .from('audit_log')
      .select(
        'id, action, entity_type, entity_id, actor_id, diff, created_at, users!audit_log_actor_id_fkey(email, full_name)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    if (filters.entityType) q = q.eq('entity_type', filters.entityType);
    if (filters.action) q = q.eq('action', filters.action);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) {
      // Inclusive upper bound — add a day so "to=2026-04-13" means "through end of 04-13"
      const toPlus = new Date(filters.to);
      toPlus.setDate(toPlus.getDate() + 1);
      q = q.lt('created_at', toPlus.toISOString());
    }

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
    let entries = rows.map((r) => {
      const u = Array.isArray(r.users) ? r.users[0] : r.users;
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

    // actorEmail filter is client-side (it's a joined column; PostgREST
    // filters on embedded resources are awkward + not needed for v1 scale).
    if (filters.actorEmail && filters.actorEmail.trim()) {
      const needle = filters.actorEmail.trim().toLowerCase();
      entries = entries.filter((e) =>
        e.actorEmail ? e.actorEmail.toLowerCase().includes(needle) : false,
      );
    }

    const total = count ?? entries.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { entries, page, pageSize, total, totalPages };
  } catch {
    return { entries: [], page, pageSize, total: 0, totalPages: 1 };
  }
}
