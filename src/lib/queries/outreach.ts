import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProspectStatus } from '@/lib/outreach/meta';

/** Read queries for the outreach module. All fail soft. */

export type DayHours = { start: number; end: number };

export type OutreachSettings = {
  dailyDialTarget: number;
  weeklyBookedTarget: number;
  commissionRate: number;
  slotTimezone: string;
  /** day (0=Sun … 6=Sat) → open hours. Absent day = closed. */
  slotHours: Record<number, DayHours>;
};

const DEFAULT_SLOT_HOURS: Record<number, DayHours> = {
  1: { start: 9, end: 17 },
  2: { start: 9, end: 17 },
  3: { start: 9, end: 17 },
  4: { start: 9, end: 17 },
  5: { start: 9, end: 17 },
};

const DEFAULT_SETTINGS: OutreachSettings = {
  dailyDialTarget: 25,
  weeklyBookedTarget: 4,
  commissionRate: 0.1,
  slotTimezone: 'America/New_York',
  slotHours: DEFAULT_SLOT_HOURS,
};

function parseSlotHours(raw: unknown): Record<number, DayHours> {
  const out: Record<number, DayHours> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const dv = v as { start?: unknown; end?: unknown };
      const start = Number(dv?.start);
      const end = Number(dv?.end);
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end <= 24 &&
        end > start
      ) {
        out[day] = { start, end };
      }
    }
  }
  return Object.keys(out).length ? out : { ...DEFAULT_SLOT_HOURS };
}

export async function getOutreachSettings(): Promise<OutreachSettings> {
  try {
    const { data } = await supabaseAdmin()
      .from('outreach_settings')
      .select(
        'daily_dial_target, weekly_booked_target, commission_rate, slot_timezone, slot_hours',
      )
      .maybeSingle();
    if (!data) return DEFAULT_SETTINGS;
    return {
      dailyDialTarget: (data.daily_dial_target as number | null) ?? 25,
      weeklyBookedTarget: (data.weekly_booked_target as number | null) ?? 4,
      commissionRate: Number(data.commission_rate ?? 0.1),
      slotTimezone: (data.slot_timezone as string | null) ?? 'America/New_York',
      slotHours: parseSlotHours(data.slot_hours),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** One logged dial — the history behind a prospect's attempt count. */
export type ProspectCall = {
  id: string;
  disposition: ProspectStatus;
  spokeWithDm: boolean;
  note: string | null;
  calledAt: string;
  setterId: string | null;
  setterName: string | null;
};

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
  /** Most recent dials first. Empty unless the caller asked for history. */
  history: ProspectCall[];
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

/** userId → display name, preferring the team-member record. */
export async function resolveSetterNames(
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

function mapRow(
  r: DbRow,
  ownerName: string | null,
  history: ProspectCall[] = [],
): ProspectRow {
  return {
    id: r.id,
    ownerId: r.owner_id,
    ownerName,
    history,
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

/** How many past dials we attach per prospect — enough context, no wall of text. */
const HISTORY_PER_PROSPECT = 6;

/**
 * Recent dials for a set of prospects, newest first, capped per prospect.
 * One query for the whole page rather than one per card.
 */
async function getCallHistory(
  prospectIds: string[],
  names: Map<string, string>,
): Promise<Map<string, ProspectCall[]>> {
  const byProspect = new Map<string, ProspectCall[]>();
  if (prospectIds.length === 0) return byProspect;
  try {
    const { data } = await supabaseAdmin()
      .from('prospect_calls')
      .select('id, prospect_id, setter_id, disposition, spoke_with_dm, note, called_at')
      .in('prospect_id', prospectIds)
      .order('called_at', { ascending: false });
    const rows = (data ?? []) as Array<{ setter_id: string | null }>;
    // A dial may have been logged by someone who no longer owns the prospect.
    const unknown = rows
      .map((r) => r.setter_id)
      .filter((id): id is string => !!id && !names.has(id));
    if (unknown.length > 0) {
      for (const [k, v] of await resolveSetterNames(unknown)) names.set(k, v);
    }
    for (const r of (data ?? []) as Array<{
      id: string;
      prospect_id: string;
      setter_id: string | null;
      disposition: ProspectStatus;
      spoke_with_dm: boolean | null;
      note: string | null;
      called_at: string;
    }>) {
      const list = byProspect.get(r.prospect_id) ?? [];
      if (list.length >= HISTORY_PER_PROSPECT) continue;
      list.push({
        id: r.id,
        disposition: r.disposition,
        spokeWithDm: !!r.spoke_with_dm,
        note: r.note,
        calledAt: r.called_at,
        setterId: r.setter_id,
        setterName: r.setter_id ? names.get(r.setter_id) ?? null : null,
      });
      byProspect.set(r.prospect_id, list);
    }
  } catch {
    /* no history rather than no list */
  }
  return byProspect;
}

/**
 * List prospects. `setterId` scopes to one setter's list (used by the setter
 * portal and the owner's per-setter filter). `activeOnly` hides dead entries
 * (converted / not-interested / bad-number / dnc) for the working queue.
 * `withHistory` attaches recent dials so a setter can see what happened on the
 * last three attempts before making the fourth.
 */
export async function getProspects(opts: {
  setterId?: string;
  activeOnly?: boolean;
  withHistory?: boolean;
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
    const history = opts.withHistory
      ? await getCallHistory(rows.map((r) => r.id), names)
      : new Map<string, ProspectCall[]>();
    return rows.map((r) =>
      mapRow(
        r,
        r.owner_id ? names.get(r.owner_id) ?? null : null,
        history.get(r.id) ?? [],
      ),
    );
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
    const history = await getCallHistory([r.id], names);
    return mapRow(
      r,
      r.owner_id ? names.get(r.owner_id) ?? null : null,
      history.get(r.id) ?? [],
    );
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Scorecard — Daily Numbers / weekly stats from prospect_calls.
 *   Dial = any logged call · Conversation = spoke_with_dm · Booked = disposition 'booked'
 * ------------------------------------------------------------------------- */

export type PeriodStats = {
  dials: number;
  conversations: number;
  booked: number;
  contactRate: number; // conversations / dials
  bookRate: number; // booked / conversations
};

type CallRow = {
  setter_id: string | null;
  spoke_with_dm: boolean;
  disposition: string;
};

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeekUtc(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function tally(rows: CallRow[]): PeriodStats {
  const dials = rows.length;
  const conversations = rows.filter((r) => r.spoke_with_dm).length;
  const booked = rows.filter((r) => r.disposition === 'booked').length;
  return {
    dials,
    conversations,
    booked,
    contactRate: dials > 0 ? conversations / dials : 0,
    bookRate: conversations > 0 ? booked / conversations : 0,
  };
}

async function fetchCalls(fromIso: string, setterId?: string): Promise<CallRow[]> {
  try {
    let q = supabaseAdmin()
      .from('prospect_calls')
      .select('setter_id, spoke_with_dm, disposition')
      .gte('called_at', fromIso);
    if (setterId) q = q.eq('setter_id', setterId);
    const { data } = await q;
    return (data ?? []) as CallRow[];
  } catch {
    return [];
  }
}

/** Today + this-week stats for one setter (their own dashboard). */
export async function getSetterScorecard(
  setterId: string,
): Promise<{ today: PeriodStats; week: PeriodStats }> {
  const [today, week] = await Promise.all([
    fetchCalls(startOfTodayUtc(), setterId).then(tally),
    fetchCalls(startOfWeekUtc(), setterId).then(tally),
  ]);
  return { today, week };
}

export type SetterScoreRow = {
  setterId: string;
  name: string;
} & PeriodStats;

/** Owner scorecard: studio totals + this-week per-setter breakdown + targets. */
export async function getOwnerScorecard(): Promise<{
  today: PeriodStats;
  week: PeriodStats;
  perSetter: SetterScoreRow[];
  settings: OutreachSettings;
}> {
  const [todayRows, weekRows, settings, setters] = await Promise.all([
    fetchCalls(startOfTodayUtc()),
    fetchCalls(startOfWeekUtc()),
    getOutreachSettings(),
    getSetterOptions(),
  ]);
  const nameById = new Map(setters.map((s) => [s.userId, s.name]));
  const bySetter = new Map<string, CallRow[]>();
  for (const r of weekRows) {
    if (!r.setter_id) continue;
    const list = bySetter.get(r.setter_id) ?? [];
    list.push(r);
    bySetter.set(r.setter_id, list);
  }
  const perSetter: SetterScoreRow[] = [...bySetter.entries()]
    .map(([setterId, rows]) => ({
      setterId,
      name: nameById.get(setterId) ?? 'Unknown',
      ...tally(rows),
    }))
    .sort((a, b) => b.dials - a.dials);

  return { today: tally(todayRows), week: tally(weekRows), perSetter, settings };
}

export type SetterOption = { userId: string; name: string };

/** The studio owner (first admin) — whose calendar appointments land on. */
export async function getOwnerUserId(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

export type AppointmentRow = {
  id: string;
  prospectId: string | null;
  setterId: string | null;
  setterName: string | null;
  businessName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  scheduledAt: string;
  durationMin: number;
  status: 'scheduled' | 'showed' | 'no_show' | 'canceled';
  result: 'pending' | 'won' | 'lost';
  dealValueCents: number | null;
  commissionCents: number | null;
  googleEventId: string | null;
  notes: string | null;
};

const APPT_COLUMNS =
  'id, prospect_id, setter_id, business_name, contact_name, phone, email, scheduled_at, duration_min, status, result, deal_value_cents, commission_cents, google_event_id, notes';

/** Appointments, soonest first. Scope to one setter when given. */
export async function getAppointments(opts: {
  setterId?: string;
} = {}): Promise<AppointmentRow[]> {
  try {
    let q = supabaseAdmin().from('appointments').select(APPT_COLUMNS);
    if (opts.setterId) q = q.eq('setter_id', opts.setterId);
    const { data } = await q.order('scheduled_at', { ascending: true });
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const names = await resolveSetterNames(rows.map((r) => r.setter_id as string | null));
    return rows.map((r) => ({
      id: r.id as string,
      prospectId: (r.prospect_id as string | null) ?? null,
      setterId: (r.setter_id as string | null) ?? null,
      setterName: r.setter_id ? names.get(r.setter_id as string) ?? null : null,
      businessName: (r.business_name as string | null) ?? null,
      contactName: (r.contact_name as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      scheduledAt: r.scheduled_at as string,
      durationMin: (r.duration_min as number | null) ?? 30,
      status: r.status as AppointmentRow['status'],
      result: r.result as AppointmentRow['result'],
      dealValueCents: (r.deal_value_cents as number | null) ?? null,
      commissionCents: (r.commission_cents as number | null) ?? null,
      googleEventId: (r.google_event_id as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export type CommissionRow = {
  setterId: string;
  name: string;
  wonCount: number;
  dealValueCents: number;
  commissionCents: number;
};

/** Commission owed per setter, from 'won' appointments. */
export async function getCommissionSummary(): Promise<CommissionRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('appointments')
      .select('setter_id, deal_value_cents, commission_cents')
      .eq('result', 'won');
    const rows = (data ?? []) as {
      setter_id: string | null;
      deal_value_cents: number | null;
      commission_cents: number | null;
    }[];
    const byId = new Map<string, CommissionRow>();
    const names = await resolveSetterNames(rows.map((r) => r.setter_id));
    for (const r of rows) {
      if (!r.setter_id) continue;
      const cur =
        byId.get(r.setter_id) ??
        {
          setterId: r.setter_id,
          name: names.get(r.setter_id) ?? 'Unknown',
          wonCount: 0,
          dealValueCents: 0,
          commissionCents: 0,
        };
      cur.wonCount += 1;
      cur.dealValueCents += r.deal_value_cents ?? 0;
      cur.commissionCents += r.commission_cents ?? 0;
      byId.set(r.setter_id, cur);
    }
    return [...byId.values()].sort((a, b) => b.commissionCents - a.commissionCents);
  } catch {
    return [];
  }
}

export type SetterEarnings = {
  monthCents: number;
  allTimeCents: number;
  wonCount: number;
  /** Booked or showed, outcome not decided yet — commission still in play. */
  pendingCount: number;
};

/**
 * What a setter has actually earned. The scorecard tracks activity; this is
 * the number that matters to someone on commission.
 */
export async function getSetterEarnings(setterId: string): Promise<SetterEarnings> {
  const empty: SetterEarnings = {
    monthCents: 0,
    allTimeCents: 0,
    wonCount: 0,
    pendingCount: 0,
  };
  try {
    const { data } = await supabaseAdmin()
      .from('appointments')
      .select('scheduled_at, status, result, commission_cents')
      .eq('setter_id', setterId);
    const rows = (data ?? []) as {
      scheduled_at: string;
      status: AppointmentRow['status'];
      result: AppointmentRow['result'];
      commission_cents: number | null;
    }[];
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const out = { ...empty };
    for (const r of rows) {
      if (r.result === 'won') {
        const cents = r.commission_cents ?? 0;
        out.wonCount += 1;
        out.allTimeCents += cents;
        if (new Date(r.scheduled_at) >= monthStart) out.monthCents += cents;
      } else if (r.result === 'pending' && r.status !== 'canceled' && r.status !== 'no_show') {
        out.pendingCount += 1;
      }
    }
    return out;
  } catch {
    return empty;
  }
}

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
