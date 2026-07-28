import { z } from 'zod';

/**
 * Validation schemas for team members + project assignments.
 *
 * The access `role` enum here must stay in sync with ASSIGNABLE_ROLES in
 * @/lib/auth/permissions. Granting the owner-level `admin` role additionally
 * requires the `assign_owner_role` capability, enforced in the route.
 */

// Keep in sync with ASSIGNABLE_ROLES in @/lib/auth/permissions.
export const TEAM_MEMBER_ROLE_VALUES = [
  'admin',
  'manager',
  'sales',
  'project_manager',
  'client_success',
  'finance',
  'accountant',
  'contractor',
  'setter',
] as const;

export const EMPLOYMENT_TYPE_VALUES = ['employee', 'contractor'] as const;
export const RATE_TYPE_VALUES = ['hourly', 'fixed'] as const;
export const TEAM_MEMBER_STATUS_VALUES = ['active', 'inactive'] as const;

// $10M cap in cents — a guardrail against fat-finger overflow, not a policy.
const MAX_RATE_CENTS = 1_000_000_000;

export const CreateTeamMemberSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  title: z.string().max(120).optional().nullable(),
  role: z.enum(TEAM_MEMBER_ROLE_VALUES),
  employment_type: z.enum(EMPLOYMENT_TYPE_VALUES),
  status: z.enum(TEAM_MEMBER_STATUS_VALUES).optional(),
  rate_cents: z.number().int().min(0).max(MAX_RATE_CENTS).optional().nullable(),
  rate_type: z.enum(RATE_TYPE_VALUES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateTeamMemberSchema = CreateTeamMemberSchema.partial();

export const CreateAssignmentSchema = z.object({
  project_id: z.string().uuid(),
  role_on_project: z.string().max(120).optional().nullable(),
});

export type CreateTeamMemberInput = z.infer<typeof CreateTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof UpdateTeamMemberSchema>;
