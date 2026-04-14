import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProposalContent, ProposalStatus } from '@/lib/types/proposal';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  Client-safe queries (Layer 3 of the defense)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Every SELECT from a client page MUST go through this file.
 *  The SELECTs here explicitly omit admin-only columns:
 *    · profitability_cents
 *    · time_logs (whole table)
 *    · audit_log (whole table)
 *    · lead_score
 *    · contacts.tags (internal)
 *    · notes with is_private=true
 *    · milestones with is_client_visible=false
 *    · files with is_client_visible=false
 *    · proposals with status='draft'
 *
 *  Admin-only fields literally cannot leak into a client RSC payload if
 *  they're never in a returned shape.
 */

export type ClientSession = { userId: string; email: string };

/* -------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------- */

export type ClientDashboard = {
  displayName: string;
  projects: ClientProjectTile[];
  unpaidInvoices: ClientInvoiceTile[];
  pendingProposals: ClientDashboardProposal[];
  unreadMessages: number; // wired in Step 9/10
};

export type ClientDashboardProposal = {
  id: string;
  title: string;
  status: 'sent' | 'accepted' | 'rejected' | 'expired';
  totalCents: number | null;
  sentAt: string | null;
  projectId: string | null;
};

export type ClientProjectTile = {
  id: string;
  name: string;
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  milestoneProgress: { done: number; total: number };
  nextMilestone: {
    title: string;
    dueDate: string | null;
  } | null;
};

export type ClientInvoiceTile = {
  id: string;
  description: string | null;
  amountCents: number;
  dueDate: string | null;
  hostedInvoiceUrl: string | null;
  status: 'sent' | 'overdue';
  projectId: string | null;
};

export async function getClientDashboard(
  userId: string,
): Promise<ClientDashboard> {
  const [displayName, contactIds] = await Promise.all([
    fetchDisplayName(userId),
    fetchOwnedContactIds(userId),
  ]);

  if (contactIds.length === 0) {
    return {
      displayName,
      projects: [],
      unpaidInvoices: [],
      pendingProposals: [],
      unreadMessages: 0,
    };
  }

  const [projects, invoices, proposals] = await Promise.all([
    fetchProjectTiles(contactIds),
    fetchUnpaidInvoices(contactIds),
    fetchDashboardProposals(contactIds),
  ]);

  return {
    displayName,
    projects,
    unpaidInvoices: invoices,
    pendingProposals: proposals,
    unreadMessages: 0,
  };
}

async function fetchDashboardProposals(
  contactIds: string[],
): Promise<ClientDashboardProposal[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select('id, title, status, total_cents, sent_at, project_id')
      .in('contact_id', contactIds)
      .neq('status', 'draft')
      .order('sent_at', { ascending: false, nullsFirst: false });
    type Row = {
      id: string;
      title: string;
      status: 'sent' | 'accepted' | 'rejected' | 'expired';
      total_cents: number | string | null;
      sent_at: string | null;
      project_id: string | null;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      totalCents: r.total_cents == null ? null : Number(r.total_cents),
      sentAt: r.sent_at,
      projectId: r.project_id,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a single proposal — ownership verified via contact.user_id.
 * Works for project-scoped and contact-only proposals. Never returns
 * drafts (client portal never shows in-progress drafts).
 */
export async function getClientProposalById(
  proposalId: string,
  userId: string,
): Promise<ClientProposalDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, project_id, contact_id, title, status, total_cents, sent_at, accepted_at, created_at, content_json, accepted_by_name, accepted_by_ip, accepted_by_user_agent, contacts!inner(user_id)',
      )
      .eq('id', proposalId)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string | null;
      contact_id: string | null;
      title: string;
      status: ProposalStatus;
      total_cents: number | string | null;
      sent_at: string | null;
      accepted_at: string | null;
      created_at: string;
      content_json: unknown;
      accepted_by_name: string | null;
      accepted_by_ip: string | null;
      accepted_by_user_agent: string | null;
      contacts:
        | { user_id: string | null }
        | { user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    if (!contact || contact.user_id !== userId) return null;
    if (r.status === 'draft') return null;

    return {
      id: r.id,
      title: r.title,
      status: r.status as Exclude<ProposalStatus, 'draft'>,
      totalCents: r.total_cents == null ? null : Number(r.total_cents),
      sentAt: r.sent_at,
      acceptedAt: r.accepted_at,
      createdAt: r.created_at,
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
 * Project detail + sub-pages
 * ------------------------------------------------------------------------- */

export type ClientProjectDetail = {
  id: string;
  name: string;
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  contactName: string;
  milestones: ClientMilestone[];
};

export type ClientMilestone = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  sortOrder: number;
  completedAt: string | null;
};

/**
 * Returns the project only if the calling user owns it (via
 * contacts.user_id). Returns null on any mismatch — callers redirect
 * to 404 so we don't leak existence of projects the user doesn't own.
 *
 * NOTE: explicit column list — no profitability_cents, no budget_cents
 * (the client sees the proposal's investment total instead).
 */
export async function getClientProject(
  projectId: string,
  userId: string,
): Promise<ClientProjectDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select(
        `id, name, status, start_date, end_date, contact_id,
         contacts!inner(full_name, user_id)`,
      )
      .eq('id', projectId)
      .single();
    if (!data) return null;

    type Row = {
      id: string;
      name: string;
      status: ClientProjectDetail['status'];
      start_date: string | null;
      end_date: string | null;
      contact_id: string;
      contacts:
        | { full_name: string; user_id: string | null }
        | { full_name: string; user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;

    // Ownership check.
    if (contact?.user_id !== userId) return null;

    // Milestones — only client-visible ones.
    const { data: msData } = await supabaseAdmin()
      .from('milestones')
      .select(
        'id, title, description, due_date, status, sort_order, is_client_visible, completed_at',
      )
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .order('sort_order', { ascending: true });
    type MRow = {
      id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      status: ClientMilestone['status'];
      sort_order: number;
      is_client_visible: boolean;
      completed_at: string | null;
    };
    const mRows = (msData ?? []) as MRow[];

    return {
      id: r.id,
      name: r.name,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      contactName: contact.full_name,
      milestones: mRows.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        dueDate: m.due_date,
        status: m.status,
        sortOrder: m.sort_order,
        completedAt: m.completed_at,
      })),
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Files (client-visible only)
 * ------------------------------------------------------------------------- */

export type ClientFile = {
  id: string;
  fileName: string;
  sizeBytes: number;
  contentType: string | null;
  createdAt: string;
  previewUrl: string | null;
};

export async function getClientProjectFiles(
  projectId: string,
  userId: string,
): Promise<ClientFile[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('files')
      .select(
        'id, file_name, size_bytes, content_type, storage_path, created_at, is_client_visible',
      )
      .eq('project_id', projectId)
      .eq('is_client_visible', true)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      file_name: string;
      size_bytes: number | string | null;
      content_type: string | null;
      storage_path: string;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];

    if (rows.length === 0) return [];

    // Pre-sign preview URLs for in-portal viewing.
    const paths = rows.map((r) => r.storage_path);
    const { data: signed } = await supabaseAdmin()
      .storage.from('project-files')
      .createSignedUrls(paths, 3600);
    const byPath = new Map<string, string>();
    (signed ?? []).forEach((s) => {
      if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
    });

    return rows.map((r) => ({
      id: r.id,
      fileName: r.file_name,
      sizeBytes: Number(r.size_bytes ?? 0),
      contentType: r.content_type,
      createdAt: r.created_at,
      previewUrl: byPath.get(r.storage_path) ?? null,
    }));
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------
 * Invoices (all statuses — clients need to see paid ones too)
 * ------------------------------------------------------------------------- */

export type ClientInvoice = {
  id: string;
  description: string | null;
  amountCents: number;
  status: 'sent' | 'paid' | 'overdue' | 'void';
  dueDate: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
};

export async function getClientProjectInvoices(
  projectId: string,
  userId: string,
): Promise<ClientInvoice[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('invoices')
      .select(
        'id, description, amount_cents, status, due_date, paid_at, hosted_invoice_url, created_at',
      )
      .eq('project_id', projectId)
      // Hide drafts — the client never sees invoices before they're sent.
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      description: string | null;
      amount_cents: number | string;
      status: ClientInvoice['status'];
      due_date: string | null;
      paid_at: string | null;
      hosted_invoice_url: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
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
 * Proposals (non-draft only)
 * ------------------------------------------------------------------------- */

export type ClientProposalListRow = {
  id: string;
  title: string;
  status: Exclude<ProposalStatus, 'draft'>;
  totalCents: number | null;
  sentAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type ClientProposalDetail = ClientProposalListRow & {
  content: ProposalContent;
  acceptedByName: string | null;
  acceptedByIp: string | null;
  acceptedByUserAgent: string | null;
};

export async function getClientProjectProposals(
  projectId: string,
  userId: string,
): Promise<ClientProposalListRow[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, title, status, total_cents, sent_at, accepted_at, created_at',
      )
      .eq('project_id', projectId)
      // Drafts are invisible to clients, period.
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      title: string;
      status: ProposalStatus;
      total_cents: number | string | null;
      sent_at: string | null;
      accepted_at: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as Exclude<ProposalStatus, 'draft'>,
      totalCents: r.total_cents == null ? null : Number(r.total_cents),
      sentAt: r.sent_at,
      acceptedAt: r.accepted_at,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getClientProposal(
  projectId: string,
  proposalId: string,
  userId: string,
): Promise<ClientProposalDetail | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('proposals')
      .select(
        'id, project_id, title, status, total_cents, sent_at, accepted_at, created_at, content_json, accepted_by_name, accepted_by_ip, accepted_by_user_agent',
      )
      .eq('id', proposalId)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string | null;
      title: string;
      status: ProposalStatus;
      total_cents: number | string | null;
      sent_at: string | null;
      accepted_at: string | null;
      created_at: string;
      content_json: unknown;
      accepted_by_name: string | null;
      accepted_by_ip: string | null;
      accepted_by_user_agent: string | null;
    };
    const r = data as Row;
    if (r.project_id !== projectId) return null;
    if (r.status === 'draft') return null;

    return {
      id: r.id,
      title: r.title,
      status: r.status as Exclude<ProposalStatus, 'draft'>,
      totalCents: r.total_cents == null ? null : Number(r.total_cents),
      sentAt: r.sent_at,
      acceptedAt: r.accepted_at,
      createdAt: r.created_at,
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
 * Profile
 * ------------------------------------------------------------------------- */

export type ClientProfile = {
  fullName: string | null;
  email: string;
  emailPrefs: Record<string, boolean>;
};

export async function getClientProfile(
  userId: string,
): Promise<ClientProfile | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('full_name, email, email_prefs')
      .eq('id', userId)
      .single();
    if (!data) return null;
    return {
      fullName: (data.full_name as string | null) ?? null,
      email: data.email as string,
      emailPrefs: (data.email_prefs as Record<string, boolean>) ?? {},
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Internal helpers — all the ownership logic lives here
 * ------------------------------------------------------------------------- */

async function fetchDisplayName(userId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();
    const name = (data?.full_name as string | null) ?? null;
    if (name) return name.split(' ')[0];
    const email = (data?.email as string | null) ?? '';
    return email.split('@')[0] || 'there';
  } catch {
    return 'there';
  }
}

async function fetchOwnedContactIds(userId: string): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('contacts')
      .select('id')
      .eq('user_id', userId);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}

async function projectIsOwnedBy(
  projectId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select('id, contacts!inner(user_id)')
      .eq('id', projectId)
      .single();
    if (!data) return false;
    type Row = {
      contacts:
        | { user_id: string | null }
        | { user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    return contact?.user_id === userId;
  } catch {
    return false;
  }
}

async function fetchProjectTiles(
  contactIds: string[],
): Promise<ClientProjectTile[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('projects')
      .select('id, name, status, start_date, end_date, created_at')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      name: string;
      status: ClientProjectTile['status'];
      start_date: string | null;
      end_date: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return [];

    const projectIds = rows.map((r) => r.id);
    const { data: msData } = await supabaseAdmin()
      .from('milestones')
      .select('id, project_id, title, due_date, status, sort_order')
      .in('project_id', projectIds)
      .eq('is_client_visible', true)
      .order('sort_order', { ascending: true });

    type MRow = {
      id: string;
      project_id: string;
      title: string;
      due_date: string | null;
      status: ClientMilestone['status'];
      sort_order: number;
    };
    const allMs = (msData ?? []) as MRow[];

    return rows.map((r) => {
      const ms = allMs.filter((m) => m.project_id === r.id);
      const next = ms.find((m) => m.status !== 'done');
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
        milestoneProgress: {
          done: ms.filter((m) => m.status === 'done').length,
          total: ms.length,
        },
        nextMilestone: next
          ? { title: next.title, dueDate: next.due_date }
          : null,
      };
    });
  } catch {
    return [];
  }
}

async function fetchUnpaidInvoices(
  contactIds: string[],
): Promise<ClientInvoiceTile[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('invoices')
      .select(
        'id, description, amount_cents, status, due_date, hosted_invoice_url, project_id',
      )
      .in('contact_id', contactIds)
      .in('status', ['sent', 'overdue'])
      .order('due_date', { ascending: true });
    type Row = {
      id: string;
      description: string | null;
      amount_cents: number | string;
      status: 'sent' | 'overdue';
      due_date: string | null;
      hosted_invoice_url: string | null;
      project_id: string | null;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      description: r.description,
      amountCents: Number(r.amount_cents ?? 0),
      status: r.status,
      dueDate: r.due_date,
      hostedInvoiceUrl: r.hosted_invoice_url,
      projectId: r.project_id,
    }));
  } catch {
    return [];
  }
}
