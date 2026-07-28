import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProspectStatus } from '@/lib/outreach/meta';

/** Read queries for the outreach module. All fail soft. */

export type OutreachSettings = {
  dailyDialTarget: number;
  weeklyBookedTarget: number;
  commissionRate: number;
};

export async function getOutreachSettings(): Promise<OutreachSettings> {
  try {
    const { data } = await supabaseAdmin()
      .from('outreach_settings')
      .select('daily_dial_target, weekly_booked_target, commission_rate')
      .maybeSingle();
    return {
      dailyDialTarget: (data?.daily_dial_target as number | null) ?? 25,
      weeklyBookedTarget: (data?.weekly_booked_target as number | null) ?? 4,
      commissionRate: Number(data?.commission_rate ?? 0.1),
    };
  } catch {
    return { dailyDialTarget: 25, weeklyBookedTarget: 4, commissionRate: 0.1 };
  }
}

export type ProspectRow = {
  id: string;
  ownerId: string | null;
  ownerName: string | null;
  fullName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  websiteProblem: string | null;
  source: string | null;
  status: ProspectStatus;
  attempts: number;
  lastContactedAt: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  notes: string | null;
  createdAt: string;
};

const COLUMNS =
  'id, owner_id, full_name, company, phone, email, industry, website_problem, source, status, attempts, last_contacted_at, next_action, next_action_at, notes, created_at';

type DbRow = {
  id: string;
  owner_id: string | null;
  full_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  website_problem: string | null;
  source: string | null;
  status: ProspectStatus;
  attempts: number;
  last_contacted_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  created_at: string;
};

async function resolveSetterNames(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  try {
    const [{ data: users }, { data: members }] = await Promise.all([
      supabaseAdmin().from('users').select('id, full_name, email').in('id', unique),
      supabaseAdmin().from('team_members').select('user_id, full_name').in('user_id', unique),
    ]);
    const memberName = new Map<string, string>();
    for (const m of (members ?? []) as { user_id: string | null; full_name: string }[]) {
      if (m.user_id) memberName.set(m.user_id, m.full_name);
    }
    for (const u of (users ?? []) as { id: string; full_name: string | null; email: string }[]) {
      map.set(u.id, memberName.get(u.id) ?? u.full_name ?? u.email);
    }
  } catch {
    /* names stay unresolved */
  }
  return map;
}

function mapRow(r: DbRow, ownerName: string | null): ProspectRow {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName,
    fullName: r.full_name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    industry: r.industry,
    websiteProblem: r.website_problem,
    source: r.source,
    status: r.status,
    attempts: r.attempts,
    lastContactedAt: r.last_contacted_at,
    nextAction: r.next_action,
    nextActionAt: r.next_action_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

/**
 * List prospects. `setterId` scopes to one setter's list (used by the setter
 * portal and the owner's per-setter filter). `activeOnly` hides dead entries
 * (converted / not-interested / bad-number / dnc) for the working queue.
 */
export async function getProspects(opts: {
  setterId?: string;
  activeOnly?: boolean;
} = {}): Promise<ProspectRow[]> {
  try {
    let q = supabaseAdmin().from('prospects').select(COLUMNS);
    if (opts.setterId) q = q.eq('owner_id', opts.setterId);
    if (opts.activeOnly) {
      q = q.not(
        'status',
        'in',
        '(converted,not_interested,bad_number,dnc)',
      );
    }
    // Callbacks due first (nulls last), then newest.
    const { data } = await q
      .order('next_action_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as DbRow[];
    const names = await resolveSetterNames(rows.map((r) => r.owner_id));
    return rows.map((r) => mapRow(r, r.owner_id ? names.get(r.owner_id) ?? null : null));
  } catch {
    return [];
  }
}

export async function getProspect(id: string): Promise<ProspectRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('prospects')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const r = data as DbRow;
    const names = await resolveSetterNames([r.owner_id]);
    return mapRow(r, r.owner_id ? names.get(r.owner_id) ?? null : null);
  } catch {
    return null;
  }
}

export type SetterOption = { userId: string; name: string };

/** Setters (for the owner's per-setter filter). */
export async function getSetterOptions(): Promise<SetterOption[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('id, full_name, email, role')
      .eq('role', 'setter');
    const rows = (data ?? []) as {
      id: string;
      full_name: string | null;
      email: string;
    }[];
    const names = await resolveSetterNames(rows.map((r) => r.id));
    return rows
      .map((r) => ({ userId: r.id, name: names.get(r.id) ?? r.full_name ?? r.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
