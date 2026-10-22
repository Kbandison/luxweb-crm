import {
  pairTimelineAndMilestones,
  withCarePlanDefaults,
  type ProposalContent,
} from '@/lib/types/proposal';
import type { AgentProposalContent } from '@/lib/validation/agent-proposals';

/**
 * The assistant's draft fields laid over an agreement's content: the CRM's
 * defaults for a new draft, or the stored content for an edit.
 *
 * Sections merge one level deep (sending `scope.site_deliverables` keeps the
 * rest of the scope); lists and the client's party replace what was there.
 * Phases and payment rows are re-paired the way the editor pairs them, so a
 * phase sent without its payment row gets a $0 one, and a payment row whose
 * phase_id names no phase is dropped.
 */
export function mergeDraftContent(
  base: ProposalContent,
  patch: AgentProposalContent,
): ProposalContent {
  const current = withCarePlanDefaults(base);
  const { client, scope, timeline, investment, care_plan, ...rest } = patch;
  return pairTimelineAndMilestones({
    ...current,
    ...rest,
    client: client ? { ...current.client, ...client } : current.client,
    scope: scope ? { ...current.scope, ...scope } : current.scope,
    timeline: timeline ? { ...current.timeline, ...timeline } : current.timeline,
    investment: investment ? { ...current.investment, ...investment } : current.investment,
    care_plan: care_plan ? { ...current.care_plan, ...care_plan } : current.care_plan,
  });
}
