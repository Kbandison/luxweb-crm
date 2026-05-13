/**
 * Shared status metadata — labels + tone classes.
 *
 * Keep in sync with the enums in crm-master/migrations/000_complete.sql.
 * Centralized here so admin + client surfaces + email templates render
 * the same label / tone for a given enum value.
 *
 * Enum types come from the canonical const arrays under src/lib/types/.
 */

import type { ProposalStatus } from '@/lib/types/proposal';
import type { ContractStatus } from '@/lib/types/contract';

export type { ProposalStatus, ContractStatus };

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

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  pending_admin_signature: 'Awaiting our signature',
  pending_client_signature: 'Awaiting client signature',
  pending_signature: 'Awaiting signature',
  signed: 'Signed',
  void: 'Void',
};

export const CONTRACT_STATUS_TONE: Record<ContractStatus, string> = {
  pending_admin_signature: 'bg-warning/15 text-warning',
  pending_client_signature: 'bg-copper/15 text-copper',
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
