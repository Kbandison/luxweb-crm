import { ROLE_LABELS, type Role } from '@/lib/auth/permissions';
import { formatUSD } from '@/lib/formatters';
import type {
  EmploymentType,
  RateType,
  TeamMemberStatus,
} from '@/lib/queries/team';

/** Badge tones (StatusPill `tone` classes) for the Team UI. */
export const ROLE_TONE: Record<Role, string> = {
  admin: 'bg-copper-soft text-copper',
  manager: 'bg-surface-2 text-info',
  sales: 'bg-success/15 text-success',
  project_manager: 'bg-copper-soft/60 text-copper',
  client_success: 'bg-success/5 text-success',
  finance: 'bg-warning/15 text-warning',
  accountant: 'bg-surface-2 text-warning',
  contractor: 'bg-surface-2 text-ink-muted',
  client: 'bg-surface-2 text-ink-subtle',
};

export const STATUS_TONE: Record<TeamMemberStatus, string> = {
  active: 'bg-success/15 text-success',
  inactive: 'bg-surface-2 text-ink-subtle',
};

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  employee: 'Employee',
  contractor: 'Contractor',
};

export const roleLabel = (role: Role) => ROLE_LABELS[role];

/** "$120.00 / hr", "$5,000.00 fixed", or "—" when no rate is set. */
export function formatRate(
  rateCents: number | null,
  rateType: RateType,
): string {
  if (rateCents == null) return '—';
  const amount = formatUSD(rateCents);
  return rateType === 'hourly' ? `${amount} / hr` : `${amount} fixed`;
}
