/**
 * Where an agreement stands, combining the draft (crm.proposals) with any
 * contract generated from it. One status per agreement, so the Agreements
 * list doesn't make the admin cross-reference two tables.
 */
export type AgreementStage =
  | 'draft'
  | 'sent'
  | 'needs_countersign'
  | 'awaiting_client'
  | 'changes_requested'
  | 'signed'
  | 'declined'
  | 'expired'
  | 'void';

export type AgreementGroup = 'active' | 'signed' | 'closed';

export const AGREEMENT_STAGE_META: Record<
  AgreementStage,
  { label: string; tone: string; group: AgreementGroup }
> = {
  draft: { label: 'Draft', tone: 'bg-ink/5 text-ink-muted', group: 'active' },
  sent: { label: 'Sent — awaiting client', tone: 'bg-copper/15 text-copper', group: 'active' },
  // Legacy only: accepted under the old two-step flow, never counter-signed.
  // Agreements now get their contract when they're signed and sent.
  needs_countersign: {
    label: 'Accepted — no contract',
    tone: 'bg-warning/15 text-warning',
    group: 'active',
  },
  awaiting_client: {
    label: 'Awaiting client signature',
    tone: 'bg-copper/15 text-copper',
    group: 'active',
  },
  changes_requested: {
    label: 'Changes requested',
    tone: 'bg-warning/15 text-warning',
    group: 'active',
  },
  signed: { label: 'Signed', tone: 'bg-success/15 text-success', group: 'signed' },
  declined: { label: 'Declined', tone: 'bg-danger/10 text-danger', group: 'closed' },
  expired: { label: 'Expired', tone: 'bg-warning/15 text-warning', group: 'closed' },
  void: {
    label: 'Voided',
    tone: 'bg-ink-subtle/10 text-ink-subtle line-through',
    group: 'closed',
  },
};

type ContractLike = {
  id: string;
  status: string;
  created_at: string;
  /** Change requests the client left on this contract. */
  change_requests?: number;
};

/** The newest contract that isn't void — the one that counts. */
export function liveContract<C extends ContractLike>(contracts: C[]): C | null {
  return (
    [...contracts]
      .filter((c) => c.status !== 'void')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export function agreementStage(
  proposalStatus: string,
  contracts: ContractLike[],
): AgreementStage {
  const live = liveContract(contracts);
  if (live?.status === 'signed') return 'signed';
  // Requests on the contract that's still out are open; revising voids it,
  // which is what closes them.
  if (live) return (live.change_requests ?? 0) > 0 ? 'changes_requested' : 'awaiting_client';

  switch (proposalStatus) {
    case 'draft':
      return 'draft';
    case 'sent':
      return 'sent';
    case 'rejected':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'accepted':
      // Accepted with only voided contracts behind it: the agreement was
      // withdrawn, not waiting on a counter-signature.
      return contracts.length > 0 ? 'void' : 'needs_countersign';
    default:
      return 'draft';
  }
}
