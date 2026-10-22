import { z } from 'zod';
import { CreateProspectSchema } from '@/lib/validation/outreach';
import { AGENT_DEAL_STAGES } from '@/lib/outreach/agent-rules';

/**
 * Payloads for the assistant's routes (/api/agent). Stricter than the
 * setter-facing schemas where a machine is likelier to get it wrong: times
 * must carry an offset (a bare "2026-03-05T14:00" would be read as UTC and
 * book the wrong hour), and the outcomes only a booking may set are left out.
 */

const datetime = z.string().datetime({ offset: true });

/** What a touch can record. 'booked' goes through the booking route instead. */
export const AGENT_LOG_DISPOSITIONS = [
  'contacted',
  'no_answer',
  'callback',
  'interested',
  'not_interested',
  'bad_number',
  'dnc',
] as const;

export const AgentLogSchema = z.object({
  channel: z.enum(['email', 'call']).default('email'),
  disposition: z.enum(AGENT_LOG_DISPOSITIONS),
  note: z.string().max(4000).optional().nullable(),
  spoke_with_dm: z.boolean().optional(),
  occurred_at: datetime.optional().nullable(),
  next_action: z.string().max(300).optional().nullable(),
  next_action_at: datetime.optional().nullable(),
});

/** Statuses the assistant may set directly — not the ones a booking owns. */
export const AGENT_PROSPECT_STATUSES = [
  'new',
  'contacted',
  'no_answer',
  'callback',
  'interested',
  'not_interested',
  'bad_number',
  'dnc',
] as const;

export const AgentUpdateProspectSchema = CreateProspectSchema.omit({ notes: true, next_action_at: true })
  .partial()
  .extend({
    status: z.enum(AGENT_PROSPECT_STATUSES).optional(),
    next_action_at: datetime.optional().nullable(),
    /** Added under the existing notes with a date, never replacing them. */
    append_note: z.string().min(1).max(2000).optional(),
  });

export const AgentBookSchema = z.object({
  prospect_id: z.string().uuid().optional().nullable(),
  contact_name: z.string().min(1).max(200),
  business_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  scheduled_at: datetime,
  duration_min: z.number().int().min(15).max(120).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const AgentUpdateAppointmentSchema = z
  .object({
    scheduled_at: datetime.optional(),
    duration_min: z.number().int().min(15).max(120).optional(),
    /** Only canceling — showed / no-show and the result are Kevin's to record. */
    status: z.literal('canceled').optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => !(d.status === 'canceled' && (d.scheduled_at || d.duration_min)), {
    message: 'Cancel or move a call, not both at once',
  });

export const AgentNoteSchema = z.object({
  entity_type: z.enum(['contact', 'deal']),
  entity_id: z.string().uuid(),
  body: z.string().min(1).max(8000),
  /** Also record it on the contact's Activity tab as an email in or out. */
  activity: z.enum(['email_sent', 'email_received']).optional(),
  subject: z.string().max(300).optional().nullable(),
});

export const AgentDealStageSchema = z.object({
  stage: z.enum(AGENT_DEAL_STAGES),
});

/** One review as Google shows it, read from the studio's profile. */
const GoogleReviewSchema = z.object({
  /** Stable per review: Google's review id, or reviewer + time when there's none. */
  google_review_id: z.string().min(1).max(500),
  reviewer_name: z.string().min(1).max(200),
  reviewer_photo_url: z.string().url().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(10000).optional().nullable(),
  reviewed_at: datetime,
  replied: z.boolean().optional(),
});

export const AgentGoogleReviewsSchema = z.object({
  reviews: z.array(GoogleReviewSchema).max(500),
  /**
   * The list is every review Google shows right now, so a stored review
   * missing from it was taken down and leaves the site. Ignored for an empty
   * list, so a failed read can never empty the site.
   */
  complete: z.boolean().default(false),
});
