/**
 * Shared status metadata — labels + tone classes.
 *
 * Keep in sync with the enums in crm-master/migrations/000_complete.sql.
 * Centralized here so admin + client surfaces + email templates render
 * the same label / tone for a given enum value.
 */

export type ProposalStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired';

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting review',
  accepted: 'Accepted',
  rejected: 'Declined',
  expired: 'Expired',
};

export const PROPOSAL_STATUS_TONE: Record<ProposalStatus, string> = {
  draft: 'bg-ink/5 text-ink-muted',
  sent: 'bg-copper/15 text-copper',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-danger/10 text-danger',
  expired: 'bg-warning/15 text-warning',
};

export type ContractStatus = 'pending_signature' | 'signed' | 'void';

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  pending_signature: 'Awaiting signature',
  signed: 'Signed',
  void: 'Void',
};

export const CONTRACT_STATUS_TONE: Record<ContractStatus, string> = {
  pending_signature: 'bg-copper/15 text-copper',
  signed: 'bg-success/15 text-success',
  void: 'bg-ink-subtle/10 text-ink-subtle line-through',
};

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Due',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: 'bg-ink/5 text-ink-muted',
  sent: 'bg-copper/15 text-copper',
  paid: 'bg-success/15 text-success',
  overdue: 'bg-danger/15 text-danger',
  void: 'bg-ink-subtle/10 text-ink-subtle line-through',
};
