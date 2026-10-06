import { z } from 'zod';
import type { ChangeOrderDraft } from './render';

/** A change order as the editor sends it — shared by preview and send. */
export const DraftSchema = z.object({
  title: z.string().trim().min(1, 'Give it a title.').max(200),
  description: z.string().trim().min(1, 'Describe the change.').max(10000),
  scope_lines: z.array(z.string().max(500)).max(50).default([]),
  /** + adds to the price, − is a credit. Capped at ±$1M as a typo guard. */
  amount_cents: z.number().int().min(-100_000_000).max(100_000_000),
  timeline_weeks: z.number().int().min(-52).max(52),
  billing: z.enum(['on_approval', 'on_signing']),
});

export function toDraft(d: z.infer<typeof DraftSchema>): ChangeOrderDraft {
  return {
    title: d.title,
    description: d.description,
    scopeLines: d.scope_lines.map((l) => l.trim()).filter(Boolean),
    amountCents: d.amount_cents,
    timelineWeeks: d.timeline_weeks,
    billing: d.billing,
  };
}
