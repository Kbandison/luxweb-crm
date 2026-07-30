import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveSetterNames } from '@/lib/queries/outreach';
import type { ProspectStatus } from '@/lib/outreach/meta';

/**
 * Duplicate detection for the call list.
 *
 * Two setters working the same city will otherwise both dial the same
 * business, so every entry point (manual add, CSV import) checks the WHOLE
 * list — not just the caller's own — and `lookupProspects` lets a setter check
 * a number before they dial it.
 *
 * Matching is on normalized phone (digits only) or lowercased email, so
 * "(770) 555-0142" and "770-555-0142" collide the way they should.
 */

export const normPhone = (v?: string | null) => (v ?? '').replace(/\D/g, '');
export const normEmail = (v?: string | null) => (v ?? '').trim().toLowerCase();

export type ProspectMatch = {
  /** 'contact' = already a real lead in the pipeline. */
  kind: 'prospect' | 'contact';
  id: string;
  fullName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: ProspectStatus | null; // null for pipeline contacts
  attempts: number;
  lastContactedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  /** The asker already owns this one — "already on your list". */
  mine: boolean;
};

type ProspectDb = {
  id: string;
  owner_id: string | null;
  full_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: ProspectStatus;
  attempts: number | null;
  last_contacted_at: string | null;
};

type ContactDb = {
  id: string;
  full_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
};

const PROSPECT_COLS =
  'id, owner_id, full_name, company, phone, email, status, attempts, last_contacted_at';
const CONTACT_COLS = 'id, full_name, company, phone, email';

function fromProspect(r: ProspectDb, ownerName: string | null, viewerId: string): ProspectMatch {
  return {
    kind: 'prospect',
    id: r.id,
    fullName: r.full_name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    status: r.status,
    attempts: r.attempts ?? 0,
    lastContactedAt: r.last_contacted_at,
    ownerId: r.owner_id,
    ownerName,
    mine: !!r.owner_id && r.owner_id === viewerId,
  };
}

function fromContact(r: ContactDb): ProspectMatch {
  return {
    kind: 'contact',
    id: r.id,
    fullName: r.full_name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    status: null,
    attempts: 0,
    lastContactedAt: null,
    ownerId: null,
    ownerName: null,
    mine: false,
  };
}

export type ProspectIndex = {
  /** The existing entry this phone/email collides with, if any. */
  find: (phone?: string | null, email?: string | null) => ProspectMatch | null;
  /** Claim keys for a row just accepted, so one CSV can't duplicate itself. */
  reserve: (phone?: string | null, email?: string | null) => void;
};

/**
 * Load every prospect + pipeline contact keyed by phone/email. One scan up
 * front beats a query per row on a 2,000-row import; the call list is small
 * enough that this stays cheap. Fails soft to an empty index — a DB hiccup
 * shouldn't block adding a prospect.
 */
export async function loadProspectIndex(viewerId: string): Promise<ProspectIndex> {
  const byPhone = new Map<string, ProspectMatch>();
  const byEmail = new Map<string, ProspectMatch>();

  try {
    const sb = supabaseAdmin();
    const [{ data: prospects }, { data: contacts }] = await Promise.all([
      sb.from('prospects').select(PROSPECT_COLS),
      sb.from('contacts').select(CONTACT_COLS),
    ]);
    const pRows = (prospects ?? []) as ProspectDb[];
    const names = await resolveSetterNames(pRows.map((r) => r.owner_id));
    const add = (m: ProspectMatch) => {
      const p = normPhone(m.phone);
      const e = normEmail(m.email);
      // First writer wins — the oldest owner keeps the claim.
      if (p && !byPhone.has(p)) byPhone.set(p, m);
      if (e && !byEmail.has(e)) byEmail.set(e, m);
    };
    for (const r of pRows) {
      add(fromProspect(r, r.owner_id ? names.get(r.owner_id) ?? null : null, viewerId));
    }
    for (const r of (contacts ?? []) as ContactDb[]) add(fromContact(r));
  } catch {
    /* empty index — no dedupe rather than a failed write */
  }

  return {
    find: (phone, email) => {
      const p = normPhone(phone);
      const e = normEmail(email);
      return (p ? byPhone.get(p) : undefined) ?? (e ? byEmail.get(e) : undefined) ?? null;
    },
    reserve: (phone, email) => {
      const p = normPhone(phone);
      const e = normEmail(email);
      const self: ProspectMatch = {
        kind: 'prospect',
        id: '',
        fullName: '',
        company: null,
        phone: phone ?? null,
        email: email ?? null,
        status: null,
        attempts: 0,
        lastContactedAt: null,
        ownerId: viewerId,
        ownerName: null,
        mine: true,
      };
      if (p && !byPhone.has(p)) byPhone.set(p, self);
      if (e && !byEmail.has(e)) byEmail.set(e, self);
    },
  };
}

/** One-off check for a single new prospect. */
export async function findProspectConflict(
  phone: string | null | undefined,
  email: string | null | undefined,
  viewerId: string,
): Promise<ProspectMatch | null> {
  if (!normPhone(phone) && !normEmail(email)) return null;
  const index = await loadProspectIndex(viewerId);
  return index.find(phone, email);
}

/** Characters that would break a PostgREST or() filter. */
const sanitize = (q: string) => q.replace(/[,()*%\\]/g, ' ').trim().slice(0, 80);

/**
 * "Who has this number?" — the setter-facing lookup. Returns just enough to
 * know to skip a business (owner, status, last dial) and deliberately omits
 * notes and the pitch angle, so this isn't a back door into someone else's
 * list. Phone queries match on digits, ignoring formatting.
 */
export async function lookupProspects(
  rawQuery: string,
  viewerId: string,
): Promise<ProspectMatch[]> {
  const q = sanitize(rawQuery);
  if (q.length < 3) return [];
  const digits = normPhone(q);
  const isPhone = digits.length >= 4;

  try {
    const sb = supabaseAdmin();
    // Coarse SQL prefilter, then exact matching in JS. Phones are stored
    // formatted, so the last 4 digits are the widest needle that still narrows.
    const needle = isPhone ? digits.slice(-4) : q;
    const prospectFilter = isPhone
      ? `phone.ilike.*${needle}*`
      : `full_name.ilike.*${needle}*,company.ilike.*${needle}*,email.ilike.*${needle}*`;

    const [{ data: prospects }, { data: contacts }] = await Promise.all([
      sb.from('prospects').select(PROSPECT_COLS).or(prospectFilter).limit(50),
      sb.from('contacts').select(CONTACT_COLS).or(prospectFilter).limit(50),
    ]);

    const pRows = (prospects ?? []) as ProspectDb[];
    const names = await resolveSetterNames(pRows.map((r) => r.owner_id));
    const matches = [
      ...pRows.map((r) =>
        fromProspect(r, r.owner_id ? names.get(r.owner_id) ?? null : null, viewerId),
      ),
      ...((contacts ?? []) as ContactDb[]).map(fromContact),
    ];

    // A phone prefilter on the last 4 digits over-matches; confirm on digits.
    const hits = isPhone
      ? matches.filter((m) => normPhone(m.phone).includes(digits))
      : matches;

    return hits.slice(0, 25);
  } catch {
    return [];
  }
}
