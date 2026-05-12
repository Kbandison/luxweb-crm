import type { ProposalStatus } from '@/lib/types/proposal';
import { cn } from '@/lib/utils';

const TONE: Record<ProposalStatus, string> = {
  draft: 'bg-ink/5 text-ink-muted',
  sent: 'bg-copper/15 text-copper',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-danger/10 text-danger',
  expired: 'bg-warning/15 text-warning',
};

const LABEL: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  expired: 'Expired',
};

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]',
        TONE[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
