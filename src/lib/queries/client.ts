import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ProposalContent, ProposalStatus } from '@/lib/types/proposal';
import type { ContractStatus } from '@/lib/types/contract';
import type { CredentialKind } from '@/lib/types/credential';
import type { CarePlanStatus } from '@/lib/care-plan/types';
import type { RevisionStatus } from '@/lib/types/revision';

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
  pendingContracts: ClientDashboardContract[];
  unreadMessages: number; // wired in Step 9/10
};

export type ClientDashboardContract = {
  id: string;
  proposalTitle: string;
  agreementVersion: string;
  projectId: string | null;
  createdAt: string;
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
      pendingContracts: [],
      unreadMessages: 0,
    };
  }

  const [projects, invoices, proposals, contracts] = await Promise.all([
    fetchProjectTiles(contactIds),
    fetchUnpaidInvoices(contactIds),
    fetchDashboardProposals(contactIds),
    fetchPendingContracts(contactIds),
  ]);

  return {
    displayName,
    projects,
    unpaidInvoices: invoices,
    pendingProposals: proposals,
    pendingContracts: contracts,
    unreadMessages: 0,
  };
}

async function fetchPendingContracts(
  contactIds: string[],
): Promise<ClientDashboardContract[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, agreement_version, project_id, created_at, proposals!inner(title)',
      )
      .in('contact_id', contactIds)
      .eq('status', 'pending_signature')
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      agreement_version: string;
      project_id: string | null;
      created_at: string;
      proposals: { title: string } | { title: string }[];
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => {
      const prop = Array.isArray(r.proposals) ? r.proposals[0] : r.proposals;
      return {
        id: r.id,
        proposalTitle: prop?.title ?? 'Agreement',
        agreementVersion: r.agreement_version,
        projectId: r.project_id,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
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
 * Contracts (auto-generated on proposal acceptance)
 * ------------------------------------------------------------------------- */

export type ClientContractListRow = {
  id: string;
  status: ContractStatus;
  agreementVersion: string;
  createdAt: string;
  signedAt: string | null;
  proposalId: string;
};

export type ClientContractDetail = ClientContractListRow & {
  bodyMd: string;
  signedName: string | null;
  signedIp: string | null;
  signedUserAgent: string | null;
};

export async function getClientProjectContracts(
  projectId: string,
  userId: string,
): Promise<ClientContractListRow[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, status, agreement_version, created_at, signed_at, proposal_id',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      status: ContractStatus;
      agreement_version: string;
      created_at: string;
      signed_at: string | null;
      proposal_id: string;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      agreementVersion: r.agreement_version,
      createdAt: r.created_at,
      signedAt: r.signed_at,
      proposalId: r.proposal_id,
    }));
  } catch {
    return [];
  }
}

export async function getClientContract(
  contractId: string,
  userId: string,
): Promise<ClientContractDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('contracts')
      .select(
        'id, status, agreement_version, body_md, created_at, signed_at, signed_name, signed_ip, signed_user_agent, proposal_id, project_id, contacts!inner(user_id)',
      )
      .eq('id', contractId)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      status: ContractStatus;
      agreement_version: string;
      body_md: string;
      created_at: string;
      signed_at: string | null;
      signed_name: string | null;
      signed_ip: string | null;
      signed_user_agent: string | null;
      proposal_id: string;
      project_id: string | null;
      contacts: { user_id: string | null } | { user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    if (!contact || contact.user_id !== userId) return null;

    return {
      id: r.id,
      status: r.status,
      agreementVersion: r.agreement_version,
      bodyMd: r.body_md,
      createdAt: r.created_at,
      signedAt: r.signed_at,
      signedName: r.signed_name,
      signedIp: r.signed_ip,
      signedUserAgent: r.signed_user_agent,
      proposalId: r.proposal_id,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Project credentials (encrypted vault)
 *
 * Clients see only rows where visible_to_client = true. Secrets are
 * decrypted on demand via the reveal endpoint, which writes an audit row.
 * ------------------------------------------------------------------------- */

export type ClientCredentialRow = {
  id: string;
  kind: CredentialKind;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  createdAt: string;
};

export async function getClientProjectCredentials(
  projectId: string,
  userId: string,
): Promise<ClientCredentialRow[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('project_credentials')
      .select('id, kind, label, username, url, notes, created_at')
      .eq('project_id', projectId)
      .eq('visible_to_client', true)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      kind: CredentialKind;
      label: string;
      username: string | null;
      url: string | null;
      notes: string | null;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      username: r.username,
      url: r.url,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export type ClientCredentialSecretRow = {
  id: string;
  projectId: string;
  ciphertext: string;
  iv: string;
  tag: string;
};

/**
 * Verify the credential is visible to this client and return the encrypted
 * secret blob. Returns null on any failure (not visible, not owned, missing).
 */
export async function getClientCredentialSecret(
  credentialId: string,
  userId: string,
): Promise<ClientCredentialSecretRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_credentials')
      .select(
        'id, project_id, visible_to_client, secret_ciphertext, secret_iv, secret_tag, projects!inner(contacts!inner(user_id))',
      )
      .eq('id', credentialId)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string;
      visible_to_client: boolean;
      secret_ciphertext: string;
      secret_iv: string;
      secret_tag: string;
      projects:
        | { contacts: { user_id: string | null } | { user_id: string | null }[] }
        | { contacts: { user_id: string | null } | { user_id: string | null }[] }[];
    };
    const r = data as unknown as Row;
    if (!r.visible_to_client) return null;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    const contact = Array.isArray(project?.contacts)
      ? project.contacts[0]
      : project?.contacts;
    if (!contact || contact.user_id !== userId) return null;
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

/* -------------------------------------------------------------------------
 * Care Plan subscription (project-scoped, owner-checked)
 * ------------------------------------------------------------------------- */

export type ClientCarePlan = {
  id: string;
  stripeSubscriptionId: string;
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
};

export async function getClientProjectCarePlan(
  projectId: string,
  userId: string,
): Promise<ClientCarePlan | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select(
        'id, stripe_subscription_id, amount_cents, currency, interval, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, payment_method_brand, payment_method_last4, pending_client_secret',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);
    type Row = {
      id: string;
      stripe_subscription_id: string;
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
    };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      stripeSubscriptionId: r.stripe_subscription_id,
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
    };
  } catch {
    return null;
  }
}

/**
 * Verify a subscription belongs to a project owned by this user. Used by
 * client-side action endpoints.
 */
export async function clientOwnsSubscription(
  subscriptionRowId: string,
  userId: string,
): Promise<{
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  projectId: string | null;
} | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('care_plan_subscriptions')
      .select(
        'stripe_subscription_id, stripe_customer_id, project_id, contacts!inner(user_id)',
      )
      .eq('id', subscriptionRowId)
      .single();
    if (!data) return null;
    type Row = {
      stripe_subscription_id: string;
      stripe_customer_id: string;
      project_id: string | null;
      contacts: { user_id: string | null } | { user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    if (!contact || contact.user_id !== userId) return null;
    return {
      stripeSubscriptionId: r.stripe_subscription_id,
      stripeCustomerId: r.stripe_customer_id,
      projectId: r.project_id,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Revision requests (client feedback widget)
 * ------------------------------------------------------------------------- */

export type ClientRevisionRow = {
  id: string;
  title: string;
  body: string;
  status: RevisionStatus;
  milestoneTitle: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
};

export type ClientRevisionDetail = ClientRevisionRow & {
  projectId: string;
  comments: Array<{
    id: string;
    body: string;
    authorName: string;
    authorRole: 'admin' | 'client';
    createdAt: string;
  }>;
};

export async function getClientProjectRevisions(
  projectId: string,
  userId: string,
): Promise<ClientRevisionRow[] | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, title, body, status, resolved_at, created_at, updated_at, milestones(title)',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      title: string;
      body: string;
      status: RevisionStatus;
      resolved_at: string | null;
      created_at: string;
      updated_at: string;
      milestones: { title: string } | { title: string }[] | null;
    };
    const rows = (data ?? []) as Row[];

    // Comment counts in a second roundtrip.
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
      const milestone = Array.isArray(r.milestones)
        ? r.milestones[0]
        : r.milestones;
      return {
        id: r.id,
        title: r.title,
        body: r.body,
        status: r.status,
        milestoneTitle: milestone?.title ?? null,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        commentCount: counts.get(r.id) ?? 0,
      };
    });
  } catch {
    return [];
  }
}

export async function getClientRevision(
  revisionId: string,
  userId: string,
): Promise<ClientRevisionDetail | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, title, body, status, resolved_at, created_at, updated_at, milestones(title), contacts!inner(user_id)',
      )
      .eq('id', revisionId)
      .single();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string;
      title: string;
      body: string;
      status: RevisionStatus;
      resolved_at: string | null;
      created_at: string;
      updated_at: string;
      milestones: { title: string } | { title: string }[] | null;
      contacts: { user_id: string | null } | { user_id: string | null }[];
    };
    const r = data as unknown as Row;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    if (!contact || contact.user_id !== userId) return null;
    const milestone = Array.isArray(r.milestones)
      ? r.milestones[0]
      : r.milestones;

    const { data: cdata } = await supabaseAdmin()
      .from('revision_comments')
      .select('id, body, author_name, author_role, created_at')
      .eq('revision_id', revisionId)
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
      id: r.id,
      projectId: r.project_id,
      title: r.title,
      body: r.body,
      status: r.status,
      milestoneTitle: milestone?.title ?? null,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      commentCount: comments.length,
      comments,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Project review (client side — admin notes never returned)
 * ------------------------------------------------------------------------- */

export type ClientProjectReview = {
  projectId: string;
  clientRating: number | null;
  clientReview: string | null;
  clientConsentToPublish: boolean;
  clientSubmittedAt: string | null;
};

export async function getClientProjectReview(
  projectId: string,
  userId: string,
): Promise<ClientProjectReview | null> {
  const owned = await projectIsOwnedBy(projectId, userId);
  if (!owned) return null;
  try {
    const { data } = await supabaseAdmin()
      .from('project_reviews')
      .select(
        'project_id, client_rating, client_review, client_consent_to_publish, client_submitted_at',
      )
      .eq('project_id', projectId)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      project_id: string;
      client_rating: number | null;
      client_review: string | null;
      client_consent_to_publish: boolean;
      client_submitted_at: string | null;
    };
    const r = data as Row;
    return {
      projectId: r.project_id,
      clientRating: r.client_rating,
      clientReview: r.client_review,
      clientConsentToPublish: r.client_consent_to_publish,
      clientSubmittedAt: r.client_submitted_at,
    };
  } catch {
    return null;
  }
}
