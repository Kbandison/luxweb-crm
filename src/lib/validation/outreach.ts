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
});

export const LogCallSchema = z.object({
  disposition: z.enum(LOG_DISPOSITIONS),
  spoke_with_dm: z.boolean().optional(),
  note: z.string().max(4000).optional().nullable(),
  next_action: z.string().max(300).optional().nullable(),
  next_action_at: isoish.optional().nullable(),
});

export type CreateProspectInput = z.infer<typeof CreateProspectSchema>;
