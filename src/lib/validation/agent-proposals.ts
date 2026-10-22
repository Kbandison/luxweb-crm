import { z } from 'zod';

/**
 * Payloads for the assistant's agreement drafts (/api/agent/proposals). Every
 * section is optional: what's sent is laid over the CRM's defaults on create,
 * or over the stored draft on update. Objects are strict, so a field the
 * assistant may not set is refused rather than silently dropped. That leaves
 * out `collected` on milestones on purpose: a collected milestone becomes a
 * paid invoice at signing, and money records stay with Kevin.
 */

const text = (max: number) => z.string().trim().max(max);
const lines = z.array(z.string().trim().min(1).max(500)).max(40);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const PartySchema = z
  .object({
    kind: z.enum(['individual', 'business']),
    business_name: text(200).optional(),
    business_description: text(200).optional(),
    signer_title: text(120).optional(),
  })
  .strict();

const PhaseSchema = z
  .object({
    id: z.string().min(1).max(40).optional(),
    name: text(120).min(1),
    weeks: text(20),
    items: lines,
  })
  .strict();

const MilestoneSchema = z
  .object({
    kind: z.enum(['deposit', 'phase']),
    label: text(120).min(1),
    percent: z.number().min(0).max(100),
    amount_cents: z.number().int().min(0),
    due: text(80),
    phase_id: z.string().min(1).max(40).optional(),
  })
  .strict();

export const AgentProposalContentSchema = z
  .object({
    client: z
      .object({
        name: text(200).min(1).optional(),
        contact_email: z.string().trim().email().max(320).optional(),
        party: PartySchema.optional(),
      })
      .strict()
      .optional(),
    note_to_client: text(2000).optional(),
    prepared_date: isoDate.optional(),
    scope: z
      .object({
        pages_count: z.number().int().min(0).max(200).optional(),
        design: text(500).optional(),
        content_migration: text(500).optional(),
        integrations: lines.optional(),
        security: text(500).optional(),
        performance: text(500).optional(),
        post_launch_support_months: z.number().int().min(0).max(24).optional(),
        site_deliverables: lines.optional(),
      })
      .strict()
      .optional(),
    out_of_scope: lines.optional(),
    timeline: z
      .object({
        phases: z.array(PhaseSchema).min(1).max(12).optional(),
        total_weeks: z.number().int().min(0).max(104).optional(),
        target_launch: isoDate.or(z.literal('')).optional(),
      })
      .strict()
      .optional(),
    investment: z
      .object({
        total_cents: z.number().int().min(0).optional(),
        milestones: z.array(MilestoneSchema).min(1).max(13).optional(),
        net_days: z.number().int().min(0).max(90).optional(),
        late_fee: text(120).optional(),
        hourly_rate_cents: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    care_plan: z
      .object({
        recommended: z.boolean().optional(),
        name: text(120).optional(),
        price_cents: z.number().int().min(0).optional(),
        interval: z.enum(['month', 'year']).optional(),
        description: text(1000).optional(),
        features: lines.optional(),
      })
      .strict()
      .optional(),
    assumptions: lines.optional(),
  })
  .strict();

export type AgentProposalContent = z.infer<typeof AgentProposalContentSchema>;

export const AgentCreateProposalSchema = z
  .object({
    contact_id: z.string().uuid(),
    title: text(200).min(1),
    content: AgentProposalContentSchema.optional(),
  })
  .strict();

export const AgentUpdateProposalSchema = z
  .object({
    title: text(200).min(1).optional(),
    content: AgentProposalContentSchema.optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'Send a title, content, or both',
  });
