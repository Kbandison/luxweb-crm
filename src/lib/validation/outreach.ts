import { z } from 'zod';

/**
 * Validation for the outreach call list. Dispositions a setter can log on a
 * dial (the initial 'new' and system 'converted' states aren't logged).
 */
export const LOG_DISPOSITIONS = [
  'no_answer',
  'callback',
  'interested',
  'booked',
  'not_interested',
  'bad_number',
  'dnc',
] as const;

export const PROSPECT_STATUSES = [
  'new',
  'no_answer',
  'callback',
  'interested',
  'booked',
  'converted',
  'not_interested',
  'bad_number',
  'dnc',
  // System-set: dialed `auto_retire_after` times with no answer.
  'unreachable',
] as const;

const isoish = z.string().datetime({ offset: true }).or(z.string().min(1));

export const CreateProspectSchema = z.object({
  full_name: z.string().min(1).max(200),
  company: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  website_problem: z.string().max(1000).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  next_action: z.string().max(300).optional().nullable(),
  next_action_at: isoish.optional().nullable(),
});

export const UpdateProspectSchema = CreateProspectSchema.partial().extend({
  status: z.enum(PROSPECT_STATUSES).optional(),
  // Reassign to another setter. Only the owner/manager may set this — a setter
  // can't hand their own prospects away or take someone else's.
  owner_id: z.string().uuid().nullable().optional(),
});

export const BULK_PROSPECT_ACTIONS = ['dnc', 'not_interested', 'delete', 'reassign'] as const;

export const BulkProspectSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(BULK_PROSPECT_ACTIONS),
  /** Required for 'reassign'. */
  owner_id: z.string().uuid().optional(),
});

export const LogCallSchema = z.object({
  disposition: z.enum(LOG_DISPOSITIONS),
  spoke_with_dm: z.boolean().optional(),
  note: z.string().max(4000).optional().nullable(),
  next_action: z.string().max(300).optional().nullable(),
  next_action_at: isoish.optional().nullable(),
});

export type CreateProspectInput = z.infer<typeof CreateProspectSchema>;

export const APPOINTMENT_STATUSES = ['scheduled', 'showed', 'no_show', 'canceled'] as const;
export const APPOINTMENT_RESULTS = ['pending', 'won', 'lost'] as const;

export const BookAppointmentSchema = z.object({
  prospect_id: z.string().uuid().optional().nullable(),
  business_name: z.string().max(200).optional().nullable(),
  contact_name: z.string().min(1).max(200),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  scheduled_at: isoish,
  duration_min: z.number().int().min(5).max(600).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  result: z.enum(APPOINTMENT_RESULTS).optional(),
  deal_value_cents: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const DayHoursSchema = z.object({
  start: z.number().int().min(0).max(23),
  end: z.number().int().min(1).max(24),
});

export const UpdateOutreachSettingsSchema = z.object({
  daily_dial_target: z.number().int().min(0).max(1000).optional(),
  weekly_booked_target: z.number().int().min(0).max(1000).optional(),
  commission_rate: z.number().min(0).max(1).optional(), // fraction, e.g. 0.10
  slot_timezone: z.string().min(1).max(64).optional(),
  // { "0".."6": { start, end } } — a day absent means closed.
  slot_hours: z.record(z.string().regex(/^[0-6]$/), DayHoursSchema).optional(),
  call_script: z.string().max(8000).optional().nullable(),
  objection_notes: z.string().max(8000).optional().nullable(),
  // No-answer dials before a prospect retires itself. 0 = off.
  auto_retire_after: z.number().int().min(0).max(50).optional(),
});
