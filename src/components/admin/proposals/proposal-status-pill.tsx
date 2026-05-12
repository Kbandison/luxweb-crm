import type { ProposalStatus } from '@/lib/types/proposal';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_TONE,
} from '@/lib/status-meta';
import { cn } from '@/lib/utils';

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
        PROPOSAL_STATUS_TONE[status],
      )}
    >
      {PROPOSAL_STATUS_LABEL[status]}
    </span>
  );
}
