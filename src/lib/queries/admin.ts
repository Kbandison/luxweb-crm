import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type PipelineStage =
  | 'lead'
  | 'discovery'
  | 'proposal'
  | 'active'
  | 'completed'
  | 'retainer';

const STAGE_ORDER: PipelineStage[] = [
  'lead',
  'discovery',
  'proposal',
  'active',
  'completed',
  'retainer',
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  proposal: 'Proposal',
  active: 'Active',
  completed: 'Completed',
  retainer: 'Retainer',
};

const OPEN_STAGES: readonly PipelineStage[] = [
  'lead',
  'discovery',
  'proposal',
  'active',
] as const;

export type StageBucket = {
  stage: PipelineStage;
  label: string;
  count: number;
  valueCents: number;
};

export type ActivityRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type DashboardOverview = {
  pipelineValueCents: number;
  pipelineDealCount: number;
  pipelineAvgCents: number;
  pipelineByStage: StageBucket[];
  activeProjectCount: number;
  unpaidInvoiceCents: number;
  unpaidInvoiceCount: number;
  thisMonthEarningsCents: number;
  thisMonthEarningsCount: number;
  unreadMessagesCount: number;
  recentActivity: ActivityRow[];
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  created_at: string;
  // Supabase typegen infers joins as arrays even for 1:1 relations.
  users: { email: string } | { email: string }[] | null;
};

/**
 * Pull the numbers for the admin dashboard in parallel.
 * Each query is wrapped so one broken piece doesn't kill the page.
 */
export async function getAdminDashboardOverview(): Promise<DashboardOverview> {
  const [pipeline, activeProjectCount, invoices, earnings, activity] =
    await Promise.all([
      pipelineAggregate(),
      activeProjects(),
      unpaidInvoices(),
      thisMonthEarnings(),
      recentActivity(),
    ]);

  return {
    pipelineValueCents: pipeline.valueCents,
    pipelineDealCount: pipeline.count,
    pipelineAvgCents: pipeline.avgCents,
    pipelineByStage: pipeline.byStage,
    activeProjectCount,
    unpaidInvoiceCents: invoices.valueCents,
    unpaidInvoiceCount: invoices.count,
    thisMonthEarningsCents: earnings.valueCents,
    thisMonthEarningsCount: earnings.count,
    unreadMessagesCount: 0, // wired in step 10 with notifications
    recentActivity: activity,
  };
}

async function pipelineAggregate(): Promise<{
  valueCents: number;
  count: number;
  avgCents: number;
  byStage: StageBucket[];
}> {
  try {
    const { data } = await supabaseAdmin()
      .from('deals')
      .select('stage, value_cents');
    const rows =
      (data ?? []) as { stage: PipelineStage; value_cents: number | null }[];

    let valueCents = 0;
    let count = 0;
    for (const r of rows) {
      if (OPEN_STAGES.includes(r.stage)) {
        valueCents += r.value_cents ?? 0;
        count += 1;
      }
    }

    const byStage: StageBucket[] = STAGE_ORDER.map((stage) => {
      const bucket = rows.filter((r) => r.stage === stage);
      return {
        stage,
        label: STAGE_LABELS[stage],
        count: bucket.length,
        valueCents: bucket.reduce((s, r) => s + (r.value_cents ?? 0), 0),
      };
    });

    return {
      valueCents,
      count,
      avgCents: count > 0 ? Math.round(valueCents / count) : 0,
      byStage,
    };
  } catch {
    return {
      valueCents: 0,
      count: 0,
      avgCents: 0,
      byStage: STAGE_ORDER.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: 0,
        valueCents: 0,
      })),
    };
  }
}

async function activeProjects(): Promise<number> {
  try {
    const { count } = await supabaseAdmin()
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress');
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function unpaidInvoices(): Promise<{ valueCents: number; count: number }> {
  try {
    const { data } = await supabaseAdmin()
      .from('invoices')
      .select('amount_cents')
      .in('status', ['sent', 'overdue']);
    const rows = (data ?? []) as { amount_cents: number | null }[];
    return {
      valueCents: rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
      count: rows.length,
    };
  } catch {
    return { valueCents: 0, count: 0 };
  }
}

async function thisMonthEarnings(): Promise<{ valueCents: number; count: number }> {
  try {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const { data } = await supabaseAdmin()
      .from('invoices')
      .select('amount_cents')
      .eq('status', 'paid')
      .gte('paid_at', startOfMonth);
    const rows = (data ?? []) as { amount_cents: number | null }[];
    return {
      valueCents: rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
      count: rows.length,
    };
  } catch {
    return { valueCents: 0, count: 0 };
  }
}

function pickEmail(u: AuditRow['users']): string | null {
  if (!u) return null;
  if (Array.isArray(u)) return u[0]?.email ?? null;
  return u.email ?? null;
}

/* -------------------------------------------------------------------------
 * Deals (Pipeline surface)
 * ------------------------------------------------------------------------- */

export type DealCard = {
  id: string;
  contactId: string;
  contactName: string;
  contactCompany: string | null;
  title: string;
  stage: PipelineStage;
  valueCents: number;
  probability: number;
  expectedClose: string | null;
  stageChangedAt: string;
  createdAt: string;
};

export async function getDealsForKanban(): Promise<DealCard[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('deals')
      .select(
        'id, contact_id, title, stage, value_cents, probability, expected_close, stage_changed_at, created_at, contacts!inner(full_name, company)',
      )
      .order('stage_changed_at', { ascending: false })
      .limit(500);

    type Row = {
      id: string;
      contact_id: string;
      title: string;
      stage: PipelineStage;
      value_cents: number | null;
      probability: number | null;
      expected_close: string | null;
      stage_changed_at: string;
      created_at: string;
      contacts:
        | { full_name: string; company: string | null }
        | { full_name: string; company: string | null }[];
    };
    const rows = (data ?? []) as unknown as Row[];

    return rows.map((r) => {
      const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      return {
        id: r.id,
        contactId: r.contact_id,
        contactName: contact?.full_name ?? '—',
        contactCompany: contact?.company ?? null,
        title: r.title,
        stage: r.stage,
        valueCents: r.value_cents ?? 0,
        probability: r.probability ?? 0,
        expectedClose: r.expected_close,
        stageChangedAt: r.stage_changed_at,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Contacts (Leads surface)
 * ------------------------------------------------------------------------- */

export type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  tags: string[];
  leadScore: number;
  createdAt: string;
  userId: string | null;
};

export async function getContacts(q?: string): Promise<ContactRow[]> {
  try {
    let query = supabaseAdmin()
      .from('contacts')
      .select(
        'id, full_name, email, phone, company, source, tags, lead_score, created_at, user_id',
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (q && q.trim().length > 0) {
      const term = q.trim();
      // name, email, company — case-insensitive substring
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
      );
    }

    const { data } = await query;
    const rows = (data ?? []) as {
      id: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      company: string | null;
      source: string | null;
      tags: string[] | null;
      lead_score: number | null;
      created_at: string;
      user_id: string | null;
    }[];

    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      source: r.source,
      tags: r.tags ?? [],
      leadScore: r.lead_score ?? 0,
      createdAt: r.created_at,
      userId: r.user_id,
    }));
  } catch {
    return [];
  }
}

export type ClientRow = ContactRow & {
  dealCount: number;
  openValueCents: number;
  projectCount: number;
  lastActivityAt: string | null;
};

/**
 * Stages that indicate a signed engagement. A contact with a deal in any
 * of these — or with any project — is a CLIENT, not a lead.
 */
export const SIGNED_STAGES: readonly PipelineStage[] = [
  'active',
  'completed',
  'retainer',
] as const;

/** IDs of contacts who count as clients (signed deal or any project). */
async function getClientContactIds(): Promise<Set<string>> {
  try {
    const [{ data: deals }, { data: projects }] = await Promise.all([
      supabaseAdmin()
        .from('deals')
        .select('contact_id')
        .in('stage', SIGNED_STAGES as unknown as string[]),
      supabaseAdmin().from('projects').select('contact_id'),
    ]);
    const dealRows = (deals ?? []) as { contact_id: string }[];
    const projRows = (projects ?? []) as { contact_id: string }[];
    return new Set([
      ...dealRows.map((d) => d.contact_id),
      ...projRows.map((p) => p.contact_id),
    ]);
  } catch {
    return new Set();
  }
}

/** Leads = contacts that have NOT yet become clients. */
export async function getLeads(q?: string): Promise<ContactRow[]> {
  const [contacts, clientIds] = await Promise.all([
    getContacts(q),
    getClientContactIds(),
  ]);
  return contacts.filter((c) => !clientIds.has(c.id));
}

/** Clients = contacts WITH a signed deal or any project. */
export async function getClientsList(): Promise<ClientRow[]> {
  const [contacts, clientIds] = await Promise.all([
    getContacts(),
    getClientContactIds(),
  ]);
  const clients = contacts.filter((c) => clientIds.has(c.id));
  if (clients.length === 0) return [];

  const ids = clients.map((c) => c.id);
  try {
    const [deals, projects] = await Promise.all([
      supabaseAdmin()
        .from('deals')
        .select('contact_id, stage, value_cents')
        .in('contact_id', ids),
      supabaseAdmin()
        .from('projects')
        .select('contact_id, status')
        .in('contact_id', ids),
    ]);
    const dealRows = (deals.data ?? []) as {
      contact_id: string;
      stage: PipelineStage;
      value_cents: number | null;
    }[];
    const projRows = (projects.data ?? []) as {
      contact_id: string;
      status: string;
    }[];

    return clients.map((c) => {
      const dealsForC = dealRows.filter((d) => d.contact_id === c.id);
      const openValue = dealsForC
        .filter((d) =>
          (['lead', 'discovery', 'proposal', 'active'] as PipelineStage[]).includes(
            d.stage,
          ),
        )
        .reduce((s, d) => s + (d.value_cents ?? 0), 0);
      const projs = projRows.filter((p) => p.contact_id === c.id);
      return {
        ...c,
        dealCount: dealsForC.length,
        openValueCents: openValue,
        projectCount: projs.length,
        lastActivityAt: c.createdAt,
      };
    });
  } catch {
    return clients.map((c) => ({
      ...c,
      dealCount: 0,
      openValueCents: 0,
      projectCount: 0,
      lastActivityAt: c.createdAt,
    }));
  }
}

export type DealSummary = {
  id: string;
  title: string;
  stage: PipelineStage;
  valueCents: number;
  probability: number;
  expectedClose: string | null;
  stageChangedAt: string;
  createdAt: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetCents: number | null;
};

export type NoteRow = {
  id: string;
  body: string;
  isPrivate: boolean;
  authorId: string | null;
  authorEmail: string | null;
  createdAt: string;
};

export type ClientActivity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  createdAt: string;
};

export type ClientWithDetails = ClientRow & {
  deals: DealSummary[];
  projects: ProjectSummary[];
  notes: NoteRow[];
  activity: ClientActivity[];
};

export async function getClientWithDetails(
  id: string,
): Promise<ClientWithDetails | null> {
  const base = await getContactDetail(id);
  if (!base) return null;

  const [deals, projects, notes, activity] = await Promise.all([
    fetchDeals(id),
    fetchProjects(id),
    fetchNotesForContact(id),
    fetchActivityForContact(id),
  ]);

  const openValue = deals
    .filter((d) =>
      (['lead', 'discovery', 'proposal', 'active'] as PipelineStage[]).includes(
        d.stage,
      ),
    )
    .reduce((s, d) => s + d.valueCents, 0);

  return {
    ...base,
    dealCount: deals.length,
    openValueCents: openValue,
    projectCount: projects.length,
    lastActivityAt: activity[0]?.createdAt ?? base.createdAt,
    deals,
    projects,
    notes,
    activity,
  };
}

async function fetchDeals(contactId: string): Promise<DealSummary[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('deals')
      .select(
        'id, title, stage, value_cents, probability, expected_close, stage_changed_at, created_at',
      )
      .eq('contact_id', contactId)
      .order('stage_changed_at', { ascending: false });
    const rows = (data ?? []) as {
      id: string;
      title: string;
      stage: PipelineStage;
      value_cents: number | null;
      probability: number | null;
      expected_close: string | null;
      stage_changed_at: string;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      stage: r.stage,
      valueCents: r.value_cents ?? 0,
      probability: r.probability ?? 0,
      expectedClose: r.expected_close,
      stageChangedAt: r.stage_changed_at,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Projects (Workspace surface)
 * ------------------------------------------------------------------------- */

export type ProjectStatus =
  | 'planning'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export type ProjectListRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budgetCents: number | null;
  contactId: string;
  contactName: string;
  contactCompany: string | null;
  milestoneCount: number;
  doneMilestoneCount: number;
  hoursLogged: number;
  createdAt: string;
};

export type ProjectDetail = {
  id: string;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  budgetCents: number | null;
  profitabilityCents: number | null;
  hourlyRateCents: number | null;
  contactId: string;
  contactName: string;
  contactCompany: string | null;
  dealId: string | null;
  createdAt: string;
};

export type Milestone = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  sortOrder: number;
  isClientVisible: boolean;
  completedAt: string | null;
};

export type TimeLog = {
  id: string;
  projectId: string;
  hours: number;
  logDate: string;
  note: string | null;
  createdById: string | null;
  createdByEmail: string | null;
  createdAt: string;
};

export async function getProjects(): Promise<ProjectListRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select(
        'id, name, status, start_date, end_date, budget_cents, contact_id, created_at, contacts!inner(full_name, company)',
      )
      .order('created_at', { ascending: false });

    type Row = {
      id: string;
      name: string;
      status: ProjectStatus;
      start_date: string | null;
      end_date: string | null;
      budget_cents: number | null;
      contact_id: string;
      created_at: string;
      contacts:
        | { full_name: string; company: string | null }
        | { full_name: string; company: string | null }[];
    };
    const rows = (data ?? []) as unknown as Row[];
    const ids = rows.map((r) => r.id);

    // Pull milestones + time logs in two side queries; aggregate client-side.
    const [milestonesRes, timeRes] = await Promise.all([
      ids.length === 0
        ? Promise.resolve({ data: [] })
        : supabaseAdmin()
            .from('milestones')
            .select('project_id, status')
            .in('project_id', ids),
      ids.length === 0
        ? Promise.resolve({ data: [] })
        : supabaseAdmin()
            .from('time_logs')
            .select('project_id, hours')
            .in('project_id', ids),
    ]);

    const milestones = (milestonesRes.data ?? []) as {
      project_id: string;
      status: string;
    }[];
    const timeLogs = (timeRes.data ?? []) as {
      project_id: string;
      hours: number | string | null;
    }[];

    return rows.map((r) => {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const ms = milestones.filter((m) => m.project_id === r.id);
      const hours = timeLogs
        .filter((t) => t.project_id === r.id)
        .reduce((s, t) => s + Number(t.hours ?? 0), 0);
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
        budgetCents: r.budget_cents,
        contactId: r.contact_id,
        contactName: c?.full_name ?? '—',
        contactCompany: c?.company ?? null,
        milestoneCount: ms.length,
        doneMilestoneCount: ms.filter((m) => m.status === 'done').length,
        hoursLogged: hours,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

export async function getProjectDetail(
  id: string,
): Promise<ProjectDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select(
        'id, name, status, start_date, end_date, budget_cents, profitability_cents, hourly_rate_cents, contact_id, deal_id, created_at, contacts!inner(full_name, company)',
      )
      .eq('id', id)
      .single();
    if (!data) return null;

    type Row = {
      id: string;
      name: string;
      status: ProjectStatus;
      start_date: string | null;
      end_date: string | null;
      budget_cents: number | null;
      profitability_cents: number | null;
      hourly_rate_cents: number | null;
      contact_id: string;
      deal_id: string | null;
      created_at: string;
      contacts:
        | { full_name: string; company: string | null }
        | { full_name: string; company: string | null }[];
    };
    const r = data as unknown as Row;
    const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;

    return {
      id: r.id,
      name: r.name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      budgetCents: r.budget_cents,
      profitabilityCents: r.profitability_cents,
      hourlyRateCents: r.hourly_rate_cents,
      contactId: r.contact_id,
      contactName: c?.full_name ?? '—',
      contactCompany: c?.company ?? null,
      dealId: r.deal_id,
      createdAt: r.created_at,
    };
  } catch {
    return null;
  }
}

export async function getProjectMilestones(projectId: string): Promise<Milestone[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('milestones')
      .select(
        'id, project_id, title, description, due_date, status, sort_order, is_client_visible, completed_at',
      )
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    type Row = {
      id: string;
      project_id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      status: 'pending' | 'in_progress' | 'done' | 'blocked';
      sort_order: number;
      is_client_visible: boolean;
      completed_at: string | null;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      description: r.description,
      dueDate: r.due_date,
      status: r.status,
      sortOrder: r.sort_order,
      isClientVisible: r.is_client_visible,
      completedAt: r.completed_at,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Invoices
 * ------------------------------------------------------------------------- */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export type InvoiceRow = {
  id: string;
  projectId: string | null;
  contactId: string;
  stripeInvoiceId: string | null;
  description: string | null;
  amountCents: number;
  status: InvoiceStatus;
  dueDate: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
};

export async function getProjectInvoices(
  projectId: string,
): Promise<InvoiceRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('invoices')
      .select(
        'id, project_id, contact_id, stripe_invoice_id, description, amount_cents, status, due_date, paid_at, hosted_invoice_url, created_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as {
      id: string;
      project_id: string | null;
      contact_id: string;
      stripe_invoice_id: string | null;
      description: string | null;
      amount_cents: number | string;
      status: InvoiceStatus;
      due_date: string | null;
      paid_at: string | null;
      hosted_invoice_url: string | null;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      contactId: r.contact_id,
      stripeInvoiceId: r.stripe_invoice_id,
      description: r.description,
      amountCents: Number(r.amount_cents ?? 0),
      status: r.status,
      dueDate: r.due_date,
      paidAt: r.paid_at,
      hostedInvoiceUrl: r.hosted_invoice_url,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Proposals
 * ------------------------------------------------------------------------- */

import type { ProposalContent, ProposalStatus } from '@/lib/types/proposal';
import type { ContractStatus } from '@/lib/types/contract';
import type { CredentialKind } from '@/lib/types/credential';
import type { CarePlanStatus } from '@/lib/care-plan/types';
import type { RevisionStatus } from '@/lib/types/revision';

export type ProposalRow = {
  id: string;
  projectId: string | null;
  contactId: string | null;
  dealId: string | null;
  title: string;
  status: ProposalStatus;
  totalCents: number | null;
  sentAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ProposalSignature = {
  acceptedByName: string | null;
  acceptedByIp: string | null;
  acceptedByUserAgent: string | null;
};

export type ProposalDetail = ProposalRow &
  ProposalSignature & {
    content: ProposalContent;
  };

type ProposalSelectRow = {
  id: string;
  project_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  status: ProposalStatus;
  total_cents: number | string | null;
  sent_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function toProposalRow(r: ProposalSelectRow): ProposalRow {
  return {
    id: r.id,
    projectId: r.project_id,
    contactId: r.contact_id,
    dealId: r.deal_id,
    title: r.title,
    status: r.status,
    totalCents: r.total_cents == null ? null : Number(r.total_cents),
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}

export async function getProjectProposals(
  projectId: string,
): Promise<ProposalRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, project_id, contact_id, deal_id, title, status, total_cents, sent_at, accepted_at, expires_at, created_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as ProposalSelectRow[]).map(toProposalRow);
  } catch {
    return [];
  }
}

/** Every proposal tied to a contact — whether via project_id or directly. */
export async function getContactProposals(
  contactId: string,
): Promise<ProposalRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, project_id, contact_id, deal_id, title, status, total_cents, sent_at, accepted_at, expires_at, created_at',
      )
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as ProposalSelectRow[]).map(toProposalRow);
  } catch {
    return [];
  }
}

export async function getProposal(id: string): Promise<ProposalDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, project_id, contact_id, deal_id, title, status, total_cents, sent_at, accepted_at, expires_at, created_at, content_json, accepted_by_name, accepted_by_ip, accepted_by_user_agent',
      )
      .eq('id', id)
      .single();
    if (!data) return null;
    const r = data as ProposalSelectRow & {
      content_json: unknown;
      accepted_by_name: string | null;
      accepted_by_ip: string | null;
      accepted_by_user_agent: string | null;
    };
    return {
      ...toProposalRow(r),
      content: (r.content_json ?? {}) as ProposalContent,
      acceptedByName: r.accepted_by_name,
      acceptedByIp: r.accepted_by_ip,
      acceptedByUserAgent: r.accepted_by_user_agent,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Files
 * ------------------------------------------------------------------------- */

export type ProjectFile = {
  id: string;
  projectId: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  contentType: string | null;
  uploadedById: string | null;
  uploadedByEmail: string | null;
  isClientVisible: boolean;
  createdAt: string;
  /**
   * Short-lived signed URL for inline preview. Generated at page load
   * so clicking a file is instant. Valid for ~1h — refresh by reloading.
   */
  previewUrl: string | null;
};

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('files')
      .select(
        'id, project_id, file_name, storage_path, size_bytes, content_type, uploaded_by, is_client_visible, created_at, users!files_uploaded_by_fkey(email)',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      project_id: string;
      file_name: string;
      storage_path: string;
      size_bytes: number | string | null;
      content_type: string | null;
      uploaded_by: string | null;
      is_client_visible: boolean;
      created_at: string;
      users: { email: string } | { email: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    const base = rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      fileName: r.file_name,
      storagePath: r.storage_path,
      sizeBytes: Number(r.size_bytes ?? 0),
      contentType: r.content_type,
      uploadedById: r.uploaded_by,
      uploadedByEmail: pickEmail(r.users),
      isClientVisible: r.is_client_visible,
      createdAt: r.created_at,
      previewUrl: null as string | null,
    }));

    if (base.length === 0) return base;

    // Batch-sign preview URLs server-side so the client can render images
    // and PDFs direct from Supabase Storage — no API roundtrip per click.
    try {
      const paths = base.map((f) => f.storagePath);
      const { data: signed } = await supabaseAdmin()
        .storage.from('project-files')
        .createSignedUrls(paths, 3600); // 1 hour
      const byPath = new Map<string, string>();
      (signed ?? []).forEach((s) => {
        if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
      });
      return base.map((f) => ({
        ...f,
        previewUrl: byPath.get(f.storagePath) ?? null,
      }));
    } catch {
      // Fall back to metadata-only; the preview modal still works via the
      // /download?inline=1 endpoint as a slower fallback.
      return base;
    }
  } catch {
    return [];
  }
}

export async function getProjectTimeLogs(projectId: string): Promise<TimeLog[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('time_logs')
      .select(
        'id, project_id, hours, log_date, note, created_by, created_at, users!time_logs_created_by_fkey(email)',
      )
      .eq('project_id', projectId)
      .order('log_date', { ascending: false });
    type Row = {
      id: string;
      project_id: string;
      hours: number | string;
      log_date: string;
      note: string | null;
      created_by: string | null;
      created_at: string;
      users: { email: string } | { email: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      hours: Number(r.hours ?? 0),
      logDate: r.log_date,
      note: r.note,
      createdById: r.created_by,
      createdByEmail: pickEmail(r.users),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

async function fetchProjects(contactId: string): Promise<ProjectSummary[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select('id, name, status, start_date, end_date, budget_cents')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as {
      id: string;
      name: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
      budget_cents: number | null;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      budgetCents: r.budget_cents,
    }));
  } catch {
    return [];
  }
}

async function fetchNotesForContact(contactId: string): Promise<NoteRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('notes')
      .select(
        'id, body, is_private, author_id, created_at, users!notes_author_id_fkey(email)',
      )
      .eq('entity_type', 'contact')
      .eq('entity_id', contactId)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      body: string;
      is_private: boolean;
      author_id: string | null;
      created_at: string;
      users: { email: string } | { email: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      isPrivate: r.is_private,
      authorId: r.author_id,
      authorEmail: pickEmail(r.users),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

async function fetchActivityForContact(
  contactId: string,
): Promise<ClientActivity[]> {
  try {
    // Activity = audit_log entries for contact OR for any of their deals/projects.
    const [{ data: deals }, { data: projects }] = await Promise.all([
      supabaseAdmin().from('deals').select('id').eq('contact_id', contactId),
      supabaseAdmin().from('projects').select('id').eq('contact_id', contactId),
    ]);
    const dealIds = (deals ?? []).map((d: { id: string }) => d.id);
    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    const allIds = [contactId, ...dealIds, ...projectIds];

    const { data } = await supabaseAdmin()
      .from('audit_log')
      .select(
        'id, action, entity_type, entity_id, actor_id, created_at, users!audit_log_actor_id_fkey(email)',
      )
      .in('entity_id', allIds)
      .order('created_at', { ascending: false })
      .limit(50);

    type Row = {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      actor_id: string | null;
      created_at: string;
      users: { email: string } | { email: string }[] | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actorEmail: pickEmail(r.users),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getContactDetail(id: string): Promise<ContactRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('contacts')
      .select(
        'id, full_name, email, phone, company, source, tags, lead_score, created_at, user_id',
      )
      .eq('id', id)
      .single();
    if (!data) return null;
    return {
      id: data.id as string,
      fullName: data.full_name as string,
      email: (data.email as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      company: (data.company as string | null) ?? null,
      source: (data.source as string | null) ?? null,
      tags: (data.tags as string[] | null) ?? [],
      leadScore: (data.lead_score as number | null) ?? 0,
      createdAt: data.created_at as string,
      userId: (data.user_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

async function recentActivity(): Promise<ActivityRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('audit_log')
      .select(
        'id, action, entity_type, entity_id, actor_id, created_at, users!audit_log_actor_id_fkey(email)',
      )
      .order('created_at', { ascending: false })
      .limit(8);
    const rows = (data ?? []) as unknown as AuditRow[];
    return rows.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entity_type,
      entityId: a.entity_id,
      actorEmail: pickEmail(a.users),
      createdAt: a.created_at,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Earnings — Step 14
 *
 * Cost = sum(time_logs.hours) × project.hourly_rate_cents per project.
 * Revenue = sum(invoices.amount_cents where status = 'paid').
 * Profit = revenue − cost.
 *
 * Projects without an hourly rate are still shown but report cost as null
 * (treated as 0 in profit math; surfaces show "—" for the cost column).
 * ------------------------------------------------------------------------- */

export type EarningsProjectRow = {
  projectId: string;
  projectName: string;
  contactName: string;
  hourlyRateCents: number | null;
  hours: number;
  costCents: number;
  invoicedCents: number;
  paidCents: number;
  profitCents: number;
};

export type EarningsOverview = {
  thisMonth: { paidCents: number; invoiceCount: number };
  lastMonth: { paidCents: number; invoiceCount: number };
  ytd: { paidCents: number; invoiceCount: number };
  outstanding: { sentCents: number; sentCount: number; overdueCents: number; overdueCount: number };
  projects: EarningsProjectRow[];
};

export async function getEarningsOverview(): Promise<EarningsOverview> {
  const sb = supabaseAdmin();
  const now = new Date();
  const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [paidRes, openRes, projectsRes, timeRes] = await Promise.all([
    sb
      .from('invoices')
      .select('amount_cents, paid_at, project_id')
      .eq('status', 'paid')
      .gte('paid_at', startOfYear),
    sb
      .from('invoices')
      .select('amount_cents, status, project_id')
      .in('status', ['sent', 'overdue']),
    sb
      .from('projects')
      .select('id, name, hourly_rate_cents, contact_id, contacts!inner(full_name)'),
    sb.from('time_logs').select('project_id, hours'),
  ]);

  type PaidRow = { amount_cents: number; paid_at: string; project_id: string | null };
  type OpenRow = { amount_cents: number; status: 'sent' | 'overdue'; project_id: string | null };
  type ProjectRow = {
    id: string;
    name: string;
    hourly_rate_cents: number | null;
    contact_id: string;
    contacts:
      | { full_name: string }
      | { full_name: string }[];
  };
  type TimeRow = { project_id: string; hours: number | string | null };

  const paid = (paidRes.data ?? []) as PaidRow[];
  const open = (openRes.data ?? []) as OpenRow[];
  const projects = (projectsRes.data ?? []) as unknown as ProjectRow[];
  const time = (timeRes.data ?? []) as TimeRow[];

  const sumPaid = (since: string) =>
    paid
      .filter((p) => p.paid_at >= since)
      .reduce(
        (acc, p) => ({
          paidCents: acc.paidCents + Number(p.amount_cents),
          invoiceCount: acc.invoiceCount + 1,
        }),
        { paidCents: 0, invoiceCount: 0 },
      );

  const thisMonth = sumPaid(startOfThisMonth);
  const lastMonthAll = paid.filter(
    (p) => p.paid_at >= startOfLastMonth && p.paid_at < startOfThisMonth,
  );
  const lastMonth = lastMonthAll.reduce(
    (acc, p) => ({
      paidCents: acc.paidCents + Number(p.amount_cents),
      invoiceCount: acc.invoiceCount + 1,
    }),
    { paidCents: 0, invoiceCount: 0 },
  );
  const ytd = sumPaid(startOfYear);

  const outstanding = open.reduce(
    (acc, o) => {
      const cents = Number(o.amount_cents);
      if (o.status === 'overdue') {
        return {
          ...acc,
          overdueCents: acc.overdueCents + cents,
          overdueCount: acc.overdueCount + 1,
        };
      }
      return {
        ...acc,
        sentCents: acc.sentCents + cents,
        sentCount: acc.sentCount + 1,
      };
    },
    { sentCents: 0, sentCount: 0, overdueCents: 0, overdueCount: 0 },
  );

  const hoursByProject = new Map<string, number>();
  for (const t of time) {
    const prev = hoursByProject.get(t.project_id) ?? 0;
    hoursByProject.set(t.project_id, prev + Number(t.hours ?? 0));
  }
  const paidByProject = new Map<string, number>();
  const invoicedByProject = new Map<string, number>();
  for (const p of paid) {
    if (!p.project_id) continue;
    paidByProject.set(p.project_id, (paidByProject.get(p.project_id) ?? 0) + Number(p.amount_cents));
    invoicedByProject.set(
      p.project_id,
      (invoicedByProject.get(p.project_id) ?? 0) + Number(p.amount_cents),
    );
  }
  for (const o of open) {
    if (!o.project_id) continue;
    invoicedByProject.set(
      o.project_id,
      (invoicedByProject.get(o.project_id) ?? 0) + Number(o.amount_cents),
    );
  }

  const projectRows: EarningsProjectRow[] = projects.map((p) => {
    const c = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    const hours = hoursByProject.get(p.id) ?? 0;
    const rate = p.hourly_rate_cents;
    const costCents = rate != null ? Math.round(hours * rate) : 0;
    const paidCents = paidByProject.get(p.id) ?? 0;
    const invoicedCents = invoicedByProject.get(p.id) ?? 0;
    return {
      projectId: p.id,
      projectName: p.name,
      contactName: c?.full_name ?? '—',
      hourlyRateCents: rate,
      hours,
      costCents,
      invoicedCents,
      paidCents,
      profitCents: paidCents - costCents,
    };
  });

  // Sort by profit desc — most profitable on top.
  projectRows.sort((a, b) => b.profitCents - a.profitCents);

  return {
    thisMonth,
    lastMonth,
    ytd,
    outstanding,
    projects: projectRows,
  };
}

/* -------------------------------------------------------------------------
 * Contracts
 * ------------------------------------------------------------------------- */

export type ContractRow = {
  id: string;
  proposalId: string;
  projectId: string | null;
  agreementVersion: string;
  status: ContractStatus;
  createdAt: string;
  signedAt: string | null;
  signedName: string | null;
};

export type ContractDetail = ContractRow & {
  bodyMd: string;
  signedIp: string | null;
  signedUserAgent: string | null;
  proposalTitle: string;
  clientName: string;
};

type ContractSelectRow = {
  id: string;
  proposal_id: string;
  project_id: string | null;
  agreement_version: string;
  status: ContractStatus;
  created_at: string;
  signed_at: string | null;
  signed_name: string | null;
};

function toContractRow(r: ContractSelectRow): ContractRow {
  return {
    id: r.id,
    proposalId: r.proposal_id,
    projectId: r.project_id,
    agreementVersion: r.agreement_version,
    status: r.status,
    createdAt: r.created_at,
    signedAt: r.signed_at,
    signedName: r.signed_name,
  };
}

export async function getProjectContracts(
  projectId: string,
): Promise<ContractRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, proposal_id, project_id, agreement_version, status, created_at, signed_at, signed_name',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as ContractSelectRow[]).map(toContractRow);
  } catch {
    return [];
  }
}

export async function getContract(id: string): Promise<ContractDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, proposal_id, project_id, agreement_version, status, created_at, signed_at, signed_name, signed_ip, signed_user_agent, body_md, proposals!inner(title), contacts!inner(full_name)',
      )
      .eq('id', id)
      .single();
    if (!data) return null;
    type Shape = ContractSelectRow & {
      signed_ip: string | null;
      signed_user_agent: string | null;
      body_md: string;
      proposals: { title: string } | { title: string }[];
      contacts: { full_name: string } | { full_name: string }[];
    };
    const r = data as unknown as Shape;
    const proposal = Array.isArray(r.proposals) ? r.proposals[0] : r.proposals;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return {
      ...toContractRow(r),
      bodyMd: r.body_md,
      signedIp: r.signed_ip,
      signedUserAgent: r.signed_user_agent,
      proposalTitle: proposal?.title ?? 'Proposal',
      clientName: contact?.full_name ?? '—',
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Project credentials (encrypted vault)
 *
 * Listing/detail returns metadata only — secrets are decrypted on demand
 * via the reveal endpoint, which writes an audit row each time.
 * ------------------------------------------------------------------------- */

export type CredentialRow = {
  id: string;
  projectId: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  visibleToClient: boolean;
  createdAt: string;
  updatedAt: string;
};

type CredentialSelectRow = {
  id: string;
  project_id: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  visible_to_client: boolean;
  created_at: string;
  updated_at: string;
};

function toCredentialRow(r: CredentialSelectRow): CredentialRow {
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind,
    label: r.label,
    username: r.username,
    url: r.url,
    notes: r.notes,
    visibleToClient: r.visible_to_client,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getProjectCredentials(
  projectId: string,
): Promise<CredentialRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_credentials')
      .select(
        'id, project_id, kind, label, username, url, notes, visible_to_client, created_at, updated_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as CredentialSelectRow[]).map(toCredentialRow);
  } catch {
    return [];
  }
}

export type CredentialSecretRow = {
  id: string;
  projectId: string;
  ciphertext: string;
  iv: string;
  tag: string;
};

export async function getCredentialSecret(
  id: string,
): Promise<CredentialSecretRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_credentials')
      .select('id, project_id, secret_ciphertext, secret_iv, secret_tag')
      .eq('id', id)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string;
      secret_ciphertext: string;
      secret_iv: string;
      secret_tag: string;
    };
    const r = data as Row;
    return {
      id: r.id,
      projectId: r.project_id,
      ciphertext: r.secret_ciphertext,
      iv: r.secret_iv,
      tag: r.secret_tag,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Care Plan subscriptions
 * ------------------------------------------------------------------------- */

export type CarePlanRow = {
  id: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  projectId: string | null;
  contactId: string;
  amountCents: number;
  currency: string;
  interval: string;
  status: CarePlanStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  pendingClientSecret: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CarePlanWithContext = CarePlanRow & {
  projectName: string | null;
  contactName: string;
};

type CarePlanSelectRow = {
  id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  project_id: string | null;
  contact_id: string;
  amount_cents: number;
  currency: string;
  interval: string;
  status: CarePlanStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  pending_client_secret: string | null;
  created_at: string;
  updated_at: string;
};

function toCarePlanRow(r: CarePlanSelectRow): CarePlanRow {
  return {
    id: r.id,
    stripeSubscriptionId: r.stripe_subscription_id,
    stripeCustomerId: r.stripe_customer_id,
    projectId: r.project_id,
    contactId: r.contact_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    interval: r.interval,
    status: r.status,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    canceledAt: r.canceled_at,
    paymentMethodBrand: r.payment_method_brand,
    paymentMethodLast4: r.payment_method_last4,
    pendingClientSecret: r.pending_client_secret,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getProjectCarePlan(
  projectId: string,
): Promise<CarePlanRow | null> {
  try {
    // Surface the most recent non-canceled sub for this project (you can
    // technically have multiple over time if a previous one was canceled
    // and a new one was started later).
    const { data } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select(
        'id, stripe_subscription_id, stripe_customer_id, project_id, contact_id, amount_cents, currency, interval, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, payment_method_brand, payment_method_last4, pending_client_secret, created_at, updated_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);
    const rows = (data ?? []) as CarePlanSelectRow[];
    if (rows.length === 0) return null;
    return toCarePlanRow(rows[0]);
  } catch {
    return null;
  }
}

export async function getAllCarePlans(): Promise<CarePlanWithContext[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select(
        'id, stripe_subscription_id, stripe_customer_id, project_id, contact_id, amount_cents, currency, interval, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, payment_method_brand, payment_method_last4, pending_client_secret, created_at, updated_at, contacts!inner(full_name), projects(name)',
      )
      .order('created_at', { ascending: false });
    type Row = CarePlanSelectRow & {
      contacts: { full_name: string } | { full_name: string }[];
      projects: { name: string } | { name: string }[] | null;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => {
      const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      return {
        ...toCarePlanRow(r),
        contactName: contact?.full_name ?? '—',
        projectName: project?.name ?? null,
      };
    });
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Time tracking — running timer
 * ------------------------------------------------------------------------- */

export type RunningTimer = {
  id: string;
  projectId: string;
  projectName: string;
  note: string | null;
  startedAt: string;
};

export async function getRunningTimerForUser(
  userId: string,
): Promise<RunningTimer | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('time_timers')
      .select('id, project_id, note, started_at, projects!inner(name)')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string;
      note: string | null;
      started_at: string;
      projects: { name: string } | { name: string }[];
    };
    const r = data as unknown as Row;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    return {
      id: r.id,
      projectId: r.project_id,
      projectName: project?.name ?? '—',
      note: r.note,
      startedAt: r.started_at,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Revision requests (client feedback)
 * ------------------------------------------------------------------------- */

export type RevisionRow = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  contactId: string;
  title: string;
  body: string;
  status: RevisionStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RevisionWithContext = RevisionRow & {
  projectName: string;
  contactName: string;
  milestoneTitle: string | null;
  commentCount: number;
};

export type RevisionComment = {
  id: string;
  body: string;
  authorName: string;
  authorRole: 'admin' | 'client';
  createdAt: string;
};

type RevisionSelectRow = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  contact_id: string;
  title: string;
  body: string;
  status: RevisionStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

function toRevisionRow(r: RevisionSelectRow): RevisionRow {
  return {
    id: r.id,
    projectId: r.project_id,
    milestoneId: r.milestone_id,
    contactId: r.contact_id,
    title: r.title,
    body: r.body,
    status: r.status,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getProjectRevisions(
  projectId: string,
): Promise<RevisionRow[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, milestone_id, contact_id, title, body, status, resolved_at, created_at, updated_at',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    return ((data ?? []) as RevisionSelectRow[]).map(toRevisionRow);
  } catch {
    return [];
  }
}

export async function getAllOpenRevisions(): Promise<RevisionWithContext[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, milestone_id, contact_id, title, body, status, resolved_at, created_at, updated_at, projects!inner(name), contacts!inner(full_name), milestones(title)',
      )
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false });
    type Row = RevisionSelectRow & {
      projects: { name: string } | { name: string }[];
      contacts: { full_name: string } | { full_name: string }[];
      milestones: { title: string } | { title: string }[] | null;
    };
    const rows = (data ?? []) as Row[];

    // Pull comment counts in a separate roundtrip — Supabase doesn't aggregate
    // joins inline, and we want the badge.
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: cdata } = await supabaseAdmin()
        .from('revision_comments')
        .select('revision_id')
        .in('revision_id', ids);
      type C = { revision_id: string };
      for (const c of (cdata ?? []) as C[]) {
        counts.set(c.revision_id, (counts.get(c.revision_id) ?? 0) + 1);
      }
    }

    return rows.map((r) => {
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const milestone = Array.isArray(r.milestones)
        ? r.milestones[0]
        : r.milestones;
      return {
        ...toRevisionRow(r),
        projectName: project?.name ?? '—',
        contactName: contact?.full_name ?? '—',
        milestoneTitle: milestone?.title ?? null,
        commentCount: counts.get(r.id) ?? 0,
      };
    });
  } catch {
    return [];
  }
}

export async function getRevision(
  id: string,
): Promise<{
  revision: RevisionWithContext;
  comments: RevisionComment[];
} | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, milestone_id, contact_id, title, body, status, resolved_at, created_at, updated_at, projects!inner(name), contacts!inner(full_name), milestones(title)',
      )
      .eq('id', id)
      .single();
    if (!data) return null;
    type Row = RevisionSelectRow & {
      projects: { name: string } | { name: string }[];
      contacts: { full_name: string } | { full_name: string }[];
      milestones: { title: string } | { title: string }[] | null;
    };
    const r = data as unknown as Row;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const milestone = Array.isArray(r.milestones)
      ? r.milestones[0]
      : r.milestones;

    const { data: cdata } = await supabaseAdmin()
      .from('revision_comments')
      .select('id, body, author_name, author_role, created_at')
      .eq('revision_id', id)
      .order('created_at', { ascending: true });
    type C = {
      id: string;
      body: string;
      author_name: string;
      author_role: 'admin' | 'client';
      created_at: string;
    };
    const comments = ((cdata ?? []) as C[]).map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author_name,
      authorRole: c.author_role,
      createdAt: c.created_at,
    }));

    return {
      revision: {
        ...toRevisionRow(r),
        projectName: project?.name ?? '—',
        contactName: contact?.full_name ?? '—',
        milestoneTitle: milestone?.title ?? null,
        commentCount: comments.length,
      },
      comments,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Project reviews
 * ------------------------------------------------------------------------- */

export type ProjectReview = {
  projectId: string;
  clientRating: number | null;
  clientReview: string | null;
  clientConsentToPublish: boolean;
  clientSubmittedAt: string | null;
  adminRating: number | null;
  adminNotes: string | null;
  adminSubmittedAt: string | null;
};

export type ProjectReviewWithContext = ProjectReview & {
  projectName: string;
  contactName: string;
};

type ReviewSelectRow = {
  project_id: string;
  client_rating: number | null;
  client_review: string | null;
  client_consent_to_publish: boolean;
  client_submitted_at: string | null;
  admin_rating: number | null;
  admin_notes: string | null;
  admin_submitted_at: string | null;
};

function toProjectReview(r: ReviewSelectRow): ProjectReview {
  return {
    projectId: r.project_id,
    clientRating: r.client_rating,
    clientReview: r.client_review,
    clientConsentToPublish: r.client_consent_to_publish,
    clientSubmittedAt: r.client_submitted_at,
    adminRating: r.admin_rating,
    adminNotes: r.admin_notes,
    adminSubmittedAt: r.admin_submitted_at,
  };
}

export async function getProjectReview(
  projectId: string,
): Promise<ProjectReview | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_reviews')
      .select(
        'project_id, client_rating, client_review, client_consent_to_publish, client_submitted_at, admin_rating, admin_notes, admin_submitted_at',
      )
      .eq('project_id', projectId)
      .maybeSingle();
    if (!data) return null;
    return toProjectReview(data as ReviewSelectRow);
  } catch {
    return null;
  }
}

export async function getAllProjectReviews(): Promise<
  ProjectReviewWithContext[]
> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_reviews')
      .select(
        'project_id, client_rating, client_review, client_consent_to_publish, client_submitted_at, admin_rating, admin_notes, admin_submitted_at, projects!inner(name, contacts!inner(full_name))',
      )
      .order('client_submitted_at', { ascending: false, nullsFirst: false });
    type Row = ReviewSelectRow & {
      projects:
        | {
            name: string;
            contacts: { full_name: string } | { full_name: string }[];
          }
        | {
            name: string;
            contacts: { full_name: string } | { full_name: string }[];
          }[];
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => {
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      const contact = Array.isArray(project?.contacts)
        ? project.contacts[0]
        : project?.contacts;
      return {
        ...toProjectReview(r),
        projectName: project?.name ?? '—',
        contactName: contact?.full_name ?? '—',
      };
    });
  } catch {
    return [];
  }
}
