import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPortalAccessStatus, type PortalAccessStatus } from '@/lib/queries/admin';
import type { Role } from '@/lib/auth/permissions';

/**
 * Read queries for the admin Team section. All go through the service_role
 * client (RLS is deny-all on the crm schema) and fail soft — a broken read
 * returns an empty/null result rather than throwing into the RSC render.
 */

export type EmploymentType = 'employee' | 'contractor';
export type RateType = 'hourly' | 'fixed';
export type TeamMemberStatus = 'active' | 'inactive';

export type TeamMemberRow = {
  id: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: Role;
  employmentType: EmploymentType;
  status: TeamMemberStatus;
  rateCents: number | null;
  rateType: RateType;
  notes: string | null;
  createdAt: string;
  assignmentCount: number;
};

type MemberDbRow = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  role: Role;
  employment_type: EmploymentType;
  status: TeamMemberStatus;
  rate_cents: number | null;
  rate_type: RateType;
  notes: string | null;
  created_at: string;
};

function mapMember(r: MemberDbRow, assignmentCount = 0): TeamMemberRow {
  return {
    id: r.id,
    userId: r.user_id ?? null,
    fullName: r.full_name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    title: r.title ?? null,
    role: r.role,
    employmentType: r.employment_type,
    status: r.status,
    rateCents: r.rate_cents ?? null,
    rateType: r.rate_type,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    assignmentCount,
  };
}

const MEMBER_COLUMNS =
  'id, user_id, full_name, email, phone, title, role, employment_type, status, rate_cents, rate_type, notes, created_at';

/** The full roster, newest first, with per-member assignment counts. */
export async function getTeamMembers(): Promise<TeamMemberRow[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('team_members')
      .select(MEMBER_COLUMNS)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as MemberDbRow[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const { data: assignments } = await sb
      .from('project_assignments')
      .select('team_member_id')
      .in('team_member_id', ids);
    const counts = new Map<string, number>();
    for (const a of (assignments ?? []) as { team_member_id: string }[]) {
      counts.set(a.team_member_id, (counts.get(a.team_member_id) ?? 0) + 1);
    }
    return rows.map((r) => mapMember(r, counts.get(r.id) ?? 0));
  } catch {
    return [];
  }
}

export async function getTeamMember(id: string): Promise<TeamMemberRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('team_members')
      .select(MEMBER_COLUMNS)
      .eq('id', id)
      .single();
    if (!data) return null;
    return mapMember(data as MemberDbRow);
  } catch {
    return null;
  }
}

export type MemberAssignment = {
  assignmentId: string;
  projectId: string;
  projectName: string;
  roleOnProject: string | null;
  createdAt: string;
};

/** Projects a team member is assigned to. */
export async function getMemberAssignments(
  teamMemberId: string,
): Promise<MemberAssignment[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('project_assignments')
      .select('id, project_id, role_on_project, created_at, projects!inner(name)')
      .eq('team_member_id', teamMemberId)
      .order('created_at', { ascending: false });
    type Row = {
      id: string;
      project_id: string;
      role_on_project: string | null;
      created_at: string;
      projects: { name: string } | { name: string }[];
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => {
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      return {
        assignmentId: r.id,
        projectId: r.project_id,
        projectName: project?.name ?? '—',
        roleOnProject: r.role_on_project ?? null,
        createdAt: r.created_at,
      };
    });
  } catch {
    return [];
  }
}

export type AssignableProject = { id: string; name: string };

/**
 * Projects available to assign (excludes any the member is already on).
 * The roster is small, so an unpaginated list is fine here.
 */
export async function getAssignableProjects(
  excludeAssignedTo?: string,
): Promise<AssignableProject[]> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: false });
    let projects = (data ?? []) as AssignableProject[];

    if (excludeAssignedTo) {
      const { data: assigned } = await sb
        .from('project_assignments')
        .select('project_id')
        .eq('team_member_id', excludeAssignedTo);
      const taken = new Set(
        ((assigned ?? []) as { project_id: string }[]).map((a) => a.project_id),
      );
      projects = projects.filter((p) => !taken.has(p.id));
    }
    return projects;
  } catch {
    return [];
  }
}

/** Invite/onboarding state for a member (reuses the contact portal logic). */
export async function getTeamMemberAccessStatus(
  userId: string | null,
): Promise<PortalAccessStatus> {
  return getPortalAccessStatus(userId);
}

/** Resolve the team member linked to an auth user (for the staff portal). */
export async function getTeamMemberByUserId(
  userId: string,
): Promise<TeamMemberRow | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('team_members')
      .select(MEMBER_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    return mapMember(data as MemberDbRow);
  } catch {
    return null;
  }
}

export type AssignedProjectSummary = {
  projectId: string;
  projectName: string;
  status: string;
  roleOnProject: string | null;
};

/** The projects a contractor is assigned to, for their workspace dashboard. */
export async function getAssignedProjectsForUser(
  userId: string,
): Promise<AssignedProjectSummary[]> {
  try {
    const sb = supabaseAdmin();
    const { data: member } = await sb
      .from('team_members')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    const teamMemberId = (member as { id: string } | null)?.id;
    if (!teamMemberId) return [];

    const { data } = await sb
      .from('project_assignments')
      .select('project_id, role_on_project, projects!inner(name, status)')
      .eq('team_member_id', teamMemberId)
      .order('created_at', { ascending: false });
    type Row = {
      project_id: string;
      role_on_project: string | null;
      projects: { name: string; status: string } | { name: string; status: string }[];
    };
    const rows = (data ?? []) as unknown as Row[];
    return rows.map((r) => {
      const p = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      return {
        projectId: r.project_id,
        projectName: p?.name ?? '—',
        status: p?.status ?? 'planning',
        roleOnProject: r.role_on_project ?? null,
      };
    });
  } catch {
    return [];
  }
}
