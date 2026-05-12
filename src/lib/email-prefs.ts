/**
 * Centralized email-preference catalogue for client + admin settings UIs.
 *
 * Each entry corresponds to a `NotifyEvent` type in `src/lib/notifications.ts`.
 * The dispatcher checks `user.email_prefs[event.type] === false` to opt out;
 * an undefined value is treated as enabled, so missing keys default to on.
 *
 * Only events with a real email template are surfaced here — toggles for
 * `message`-style in-app-only events would be cosmetic since `renderTemplate`
 * returns null and no email is ever sent.
 *
 * NOTE: `message` is intentionally kept on the client list because it is the
 * only in-app-only entry that pre-existed in the UI. Removing it would silently
 * drop a toggle some users may already have configured. Future cleanup can
 * revisit once the dispatcher gates in-app inserts on prefs too.
 */
export type EmailPrefOption = {
  key: string;
  label: string;
  description: string;
};

export const CLIENT_EMAIL_PREFS: readonly EmailPrefOption[] = [
  {
    key: 'message',
    label: 'New messages',
    description: 'When the team sends you a message in the portal.',
  },
  {
    key: 'invoice_sent',
    label: 'New invoices',
    description: 'When a new invoice is ready for payment.',
  },
  {
    key: 'invoice_paid',
    label: 'Payment receipts',
    description: 'Confirmation when a payment is successfully processed.',
  },
  {
    key: 'invoice_overdue',
    label: 'Overdue invoice reminders',
    description: 'A nudge when an invoice slips past its due date.',
  },
  {
    key: 'proposal_sent',
    label: 'New proposals',
    description: 'When a proposal is ready for your review.',
  },
  {
    key: 'proposal_accepted_client',
    label: 'Proposal acceptance confirmation',
    description: 'A receipt after you accept a proposal.',
  },
  {
    key: 'contract_pending_client_signature',
    label: 'Agreement ready to sign',
    description: 'When your contract is waiting on your signature.',
  },
  {
    key: 'milestone_updated',
    label: 'Milestone updates',
    description: 'When a project milestone is completed or changes status.',
  },
  {
    key: 'revision_updated',
    label: 'Replies on your reviews',
    description: 'Replies and status changes on revisions you filed.',
  },
  {
    key: 'care_plan_activated',
    label: 'Care plan activation',
    description: 'Confirmation when your ongoing care plan goes live.',
  },
] as const;

export const ADMIN_EMAIL_PREFS: readonly EmailPrefOption[] = [
  {
    key: 'message',
    label: 'New messages',
    description: 'Email when a client replies in a project thread.',
  },
  {
    key: 'new_lead',
    label: 'New lead alerts',
    description: 'Email when a contact form or marketing site submits a lead.',
  },
  {
    key: 'invoice_sent',
    label: 'Invoice sent',
    description: 'Email when an invoice is dispatched via Stripe.',
  },
  {
    key: 'invoice_paid',
    label: 'Payment received',
    description: 'Email when a client payment clears.',
  },
  {
    key: 'invoice_overdue',
    label: 'Overdue invoice alerts',
    description: 'Email when an invoice ages past its due date.',
  },
  {
    key: 'proposal_sent',
    label: 'Proposal sent',
    description: 'Email when a proposal is shared with a client.',
  },
  {
    key: 'proposal_accepted',
    label: 'Proposal accepted',
    description: 'Email when a client accepts a proposal.',
  },
  {
    key: 'contract_signed',
    label: 'Contract signed',
    description: 'Email when a client counter-signs the agreement.',
  },
  {
    key: 'milestone_updated',
    label: 'Milestone update',
    description: 'Email when a milestone changes state.',
  },
  {
    key: 'revision_requested',
    label: 'Revision request',
    description: 'Email when a client files a revision or replies on one.',
  },
] as const;

/**
 * Defaults used to seed the UI when the user's `email_prefs` JSON is missing
 * keys. Every option defaults to enabled so users opt out rather than in.
 */
export function defaultPrefsFrom(
  options: readonly EmailPrefOption[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const o of options) out[o.key] = true;
  return out;
}
