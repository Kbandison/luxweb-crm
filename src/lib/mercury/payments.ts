import 'server-only';

/**
 * Mercury payouts — the approval queue.
 *
 * Deliberately uses `request-send-money`, never `createTransaction`. Two
 * reasons, and both matter:
 *
 *  1. Safety. request-send-money only *queues* a payment; a human approves it
 *     in Mercury's dashboard before funds move, and the approver must be a
 *     different person from the token's creator. Nothing the CRM does can
 *     move money unattended.
 *  2. Access. Per Mercury's token policy, request-send-money works without an
 *     IP allowlist on a read-only token — so the CRM never holds a
 *     write-scoped credential, and no static-IP infrastructure is needed.
 *
 * Hidden behind MERCURY_PAYMENTS_ENABLED so the feature stays invisible until
 * it's deliberately switched on.
 */

import { mercuryFetch } from './http';

/**
 * Payouts are off unless explicitly enabled. Gated on its own flag rather than
 * on the presence of a write token, because a write token isn't what this
 * needs — the read-only one is sufficient.
 */
export function paymentsEnabled(): boolean {
  return (
    process.env.MERCURY_PAYMENTS_ENABLED === 'true' &&
    !!(process.env.MERCURY_WRITE_TOKEN || process.env.MERCURY_API_TOKEN)
  );
}

/** A fat-finger ceiling. Anything larger goes through Mercury directly. */
export const MAX_PAYOUT_CENTS = 5_000_000; // $50,000

export const PAYMENT_METHODS = ['ach', 'domesticWire', 'check'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type MercuryRecipient = {
  id: string;
  name: string;
  nickname: string | null;
  emails: string[];
  status: 'active' | 'deleted';
  defaultPaymentMethod: string | null;
  dateLastPaid: string | null;
};

/** Recipients you've already set up in Mercury. The CRM never creates them. */
export async function listRecipients(): Promise<MercuryRecipient[]> {
  const data = await mercuryFetch<{ recipients?: MercuryRecipient[] }>('/recipients', {
    mode: 'write',
  });
  return (data.recipients ?? []).filter((r) => r.status === 'active');
}

export type SendMoneyRequestResult = {
  requestId: string;
  status: 'pendingApproval' | 'approved' | 'rejected' | 'cancelled';
};

/**
 * Queue a payout for approval.
 *
 * `idempotencyKey` must be the payment_request row's id — stable across
 * retries, so a double-click or a re-run can't produce two payouts.
 */
export async function requestSendMoney(input: {
  accountId: string;
  recipientId: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  note?: string | null;
  externalMemo?: string | null;
}): Promise<SendMoneyRequestResult> {
  if (input.amountCents <= 0) throw new Error('Amount must be positive.');
  if (input.amountCents > MAX_PAYOUT_CENTS) {
    throw new Error('Amount exceeds the payout ceiling — send it from Mercury directly.');
  }

  const body = {
    recipientId: input.recipientId,
    // Mercury takes dollars; we hold cents.
    amount: input.amountCents / 100,
    paymentMethod: input.paymentMethod,
    idempotencyKey: input.idempotencyKey,
    note: input.note || undefined,
    externalMemo: input.externalMemo || undefined,
  };

  const res = await mercuryFetch<{
    requestId: string;
    status: SendMoneyRequestResult['status'];
  }>(`/account/${input.accountId}/request-send-money`, {
    mode: 'write',
    method: 'POST',
    body,
  });
  return { requestId: res.requestId, status: res.status };
}

export type ApprovalRequestStatus =
  | 'pendingApproval'
  | 'approved'
  | 'rejected'
  | 'cancelled';

/**
 * Current state of queued payouts.
 *
 * Approval happens asynchronously in Mercury's dashboard, so a request we
 * submitted stays 'submitted' in our table until we ask. Without this the
 * payouts list would claim "awaiting approval" forever, including for payments
 * that were approved and sent days ago.
 */
export async function listApprovalRequests(): Promise<
  Array<{ requestId: string; status: ApprovalRequestStatus }>
> {
  const data = await mercuryFetch<{
    requests?: Array<{ requestId: string; status: ApprovalRequestStatus }>;
  }>('/request-send-money', { mode: 'write', params: { limit: 200 } });
  return data.requests ?? [];
}
