import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_TONE,
} from '@/lib/status-meta';
import type { ProposalStatus } from '@/lib/types/proposal';
import { StatusPill } from '@/components/ui/status-pill';

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  return (
    <StatusPill
      label={PROPOSAL_STATUS_LABEL[status]}
      tone={PROPOSAL_STATUS_TONE[status]}
    />
  );
}
