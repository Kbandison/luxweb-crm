import { z } from 'zod';

/**
 * Payload for POST /api/outreach/ingest — leads pushed in from an external
 * lead-finding tool (ByteBoundless). Kept deliberately generic: `business_name`
 * and `angle` are the only fields that really matter, everything else is
 * enrichment we pass through if it's there.
 */
export const IngestLeadSchema = z.object({
  /** The source tool's row id — makes a re-send a no-op. */
  external_id: z.string().max(120).optional().nullable(),
  business_name: z.string().min(1).max(200),
  /** The person who answers, when the tool knows one. */
  contact_name: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  industry: z.string().max(120).optional().nullable(),
  /** Why they need a rebuild — lands in the setter's "Angle" field. */
  angle: z.string().max(1000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  /**
   * How far the sending tool already got with this business, in ITS
   * vocabulary — mapped to a CRM status on arrival. Work done before the
   * lead reached the CRM still counts.
   */
  status: z.string().max(40).optional().nullable(),
  /** When that outreach happened, so the history lands on the right date. */
  contacted_at: z.string().min(1).max(40).optional().nullable(),
});

export const IngestSchema = z.object({
  /** Which tool sent this. Stored so the CRM can tell where a lead came from. */
  source: z.string().min(1).max(60).default('byteboundless'),
  /** Email of the setter who should own these. Defaults to the studio owner. */
  assign_to: z.string().email().max(200).optional().nullable(),
  leads: z.array(IngestLeadSchema).min(1).max(500),
});

export type IngestLead = z.infer<typeof IngestLeadSchema>;
