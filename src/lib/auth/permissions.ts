/**
 * Role-based access control — the single source of truth for "what can this
 * role do." Enforcement everywhere (proxy, guards, nav, pages) checks a
 * CAPABILITY, never a hardcoded role name, so tweaking a role's access — or
 * adding a role later — is a change to the maps in this file, not a rewrite.
 *
 * Roles (internal enum values kept backward-compatible with the pre-RBAC
 * `admin | client` model — `admin` still means the owner):
 *
 *   admin           → Owner / Super Admin (full access)
 *   manager         → "Admin" (scoped): everything except billing + settings
 *   sales           → leads, pipeline, proposals, contracts (no delivery/$$)
 *   project_manager → projects, milestones, revisions, client messaging
 *   client_success  → care plans, revisions, reviews, client relationship
 *   finance         → earnings + billing (create/void invoices)
 *   accountant      → read-only financials (earnings, no edits)
 *   contractor      → assignment-scoped staff (own leads, time, assigned work)
 *   client          → external portal (unchanged)
 *
 * This module is safe to import from both server and client components (no
 * server-only imports) so the nav can filter by capability on the client.
 */

export type Role =
  | 'admin'
  | 'manager'
  | 'sales'
  | 'project_manager'
  | 'client_success'
  | 'finance'
  | 'accountant'
  | 'contractor'
  | 'client';

export type Capability =
  | 'view_dashboard'
  | 'manage_leads' // create/see/manage ALL leads + pipeline
  | 'manage_own_leads' // create/manage only leads you own (contractor)
  | 'manage_proposals'
  | 'manage_contracts'
  | 'manage_clients'
  | 'manage_projects'
  | 'manage_care_plans'
  | 'manage_reviews'
  | 'manage_revisions'
  | 'view_finance' // earnings dashboard (read)
  | 'manage_billing' // create/void invoices, Stripe actions
  | 'manage_team' // add/edit team members, assign roles + project assignments
  | 'assign_owner_role' // grant the owner-level (admin) role to a member
  | 'manage_settings'
  | 'view_assigned_projects' // contractor: only projects they're assigned to
  | 'log_time'
  | 'message_assigned'; // read + post on assigned/relevant project threads

export const ALL_CAPABILITIES: Capability[] = [
  'view_dashboard',
  'manage_leads',
  'manage_own_leads',
  'manage_proposals',
  'manage_contracts',
  'manage_clients',
  'manage_projects',
  'manage_care_plans',
  'manage_reviews',
  'manage_revisions',
  'view_finance',
  'manage_billing',
  'manage_team',
  'assign_owner_role',
  'manage_settings',
  'view_assigned_projects',
  'log_time',
  'message_assigned',
];

/**
 * Role → capabilities. Owner (`admin`) gets everything; the scoped tiers get
 * subsets tuned to how a studio divides work. Keep these in sync with the nav
 * capabilities (nav-items.tsx) and the admin page/route gates.
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  // Owner — everything.
  admin: [...ALL_CAPABILITIES],

  // Scoped admin — everything except billing, settings, and minting owners.
  manager: [
    'view_dashboard',
    'manage_leads',
    'manage_proposals',
    'manage_contracts',
    'manage_clients',
    'manage_projects',
    'manage_care_plans',
    'manage_reviews',
    'manage_revisions',
    'view_finance',
    'manage_team',
    'log_time',
    'message_assigned',
  ],

  // Sales / Account Exec — the deal funnel, no delivery or financials.
  sales: [
    'view_dashboard',
    'manage_leads',
    'manage_proposals',
    'manage_contracts',
    'manage_clients',
    'message_assigned',
  ],

  // Project Manager — delivery: projects, milestones, revisions, coordination.
  project_manager: [
    'view_dashboard',
    'manage_projects',
    'manage_revisions',
    'manage_clients',
    'log_time',
    'message_assigned',
  ],

  // Client Success — post-launch: retainers, revisions, reviews, relationship.
  client_success: [
    'view_dashboard',
    'manage_care_plans',
    'manage_revisions',
    'manage_reviews',
    'manage_clients',
    'message_assigned',
  ],

  // Finance — money: earnings + billing.
  finance: ['view_dashboard', 'view_finance', 'manage_billing'],

  // Accountant — read-only financials.
  accountant: ['view_dashboard', 'view_finance'],

  // Contractor — assignment-scoped staff.
  contractor: [
    'manage_own_leads',
    'view_assigned_projects',
    'log_time',
    'message_assigned',
  ],

  client: [],
};

export function hasCapability(
  role: Role | null | undefined,
  cap: Capability,
): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false;
}

/* -------------------------------------------------------------------------
 * Role groupings
 * ------------------------------------------------------------------------- */

/** Any internal team member (staff of any kind) — not an external client. */
export function isInternal(role: Role | null | undefined): boolean {
  return !!role && role !== 'client';
}

export function isContractor(role: Role | null | undefined): boolean {
  return role === 'contractor';
}

/** Back-office roles use the /admin area — every internal role except the
 *  assignment-scoped contractor (who uses /staff). */
export function isBackOffice(role: Role | null | undefined): boolean {
  return isInternal(role) && role !== 'contractor';
}

/** Where a freshly-authenticated user of this role should land. */
export function portalHomeFor(role: Role | null | undefined): string {
  if (isBackOffice(role)) return '/admin/dashboard';
  if (role === 'contractor') return '/staff/dashboard';
  return '/portal/dashboard';
}

/* -------------------------------------------------------------------------
 * Admin page access — path prefix → required capability. The proxy uses this
 * to confine each back-office role to its sections (API routes enforce their
 * own capability via guards). Longest matching prefix wins.
 * ------------------------------------------------------------------------- */

const ADMIN_PAGE_CAPABILITY: Array<[string, Capability]> = [
  ['/admin/dashboard', 'view_dashboard'],
  ['/admin/leads', 'manage_leads'],
  ['/admin/pipeline', 'manage_leads'],
  ['/admin/proposals', 'manage_proposals'],
  ['/admin/contracts', 'manage_contracts'],
  ['/admin/clients', 'manage_clients'],
  ['/admin/projects', 'manage_projects'],
  ['/admin/team', 'manage_team'],
  ['/admin/care-plans', 'manage_care_plans'],
  ['/admin/revisions', 'manage_revisions'],
  ['/admin/reviews', 'manage_reviews'],
  ['/admin/earnings', 'view_finance'],
  ['/admin/settings', 'manage_settings'],
  ['/admin/audit', 'manage_team'],
];

/**
 * The capability required to view an /admin page path, or null if the path
 * isn't capability-gated (e.g. /admin itself). Sub-paths inherit their
 * section's capability.
 */
export function requiredCapabilityForAdminPath(
  pathname: string,
): Capability | null {
  const match = ADMIN_PAGE_CAPABILITY.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match[1] : null;
}

/* -------------------------------------------------------------------------
 * Display metadata (used by the Team UI + role badges)
 * ------------------------------------------------------------------------- */

/**
 * Human labels. Note the intentional mapping: the internal `admin` value is
 * the OWNER (kept for backward compat), and `manager` surfaces as "Admin".
 */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Owner',
  manager: 'Admin',
  sales: 'Sales',
  project_manager: 'Project manager',
  client_success: 'Client success',
  finance: 'Finance',
  accountant: 'Accountant',
  contractor: 'Team member',
  client: 'Client',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full access to everything, including billing, settings, and the team.',
  manager: 'Everything except billing and studio settings.',
  sales: 'Leads, pipeline, proposals, and contracts. No delivery or financials.',
  project_manager:
    'Projects, milestones, revisions, and client messaging. No billing or settings.',
  client_success:
    'Care plans, revisions, reviews, and the client relationship post-launch.',
  finance: 'Financial records — earnings and invoicing.',
  accountant: 'Read-only financials — view earnings and invoices, no edits.',
  contractor:
    'Only their assigned projects, their own leads, time, and messages.',
  client: 'External client portal.',
};

/**
 * Roles an admin can assign to a team member from the Team UI, in a sensible
 * display order. Granting the owner-level `admin` role additionally requires
 * the `assign_owner_role` capability (owner-only) — enforced server-side.
 */
export const ASSIGNABLE_ROLES: Role[] = [
  'admin',
  'manager',
  'sales',
  'project_manager',
  'client_success',
  'finance',
  'accountant',
  'contractor',
];
