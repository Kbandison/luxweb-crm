/**
 * Typed catalogues for the email-preferences UI. Each pref key matches
 * the notification type used by `src/lib/notifications.ts` so toggling
 * a row in the UI flips the same `email_prefs[type]` flag that gates
 * the outbound send.
 *
 * The UI treats `undefined` as enabled — the catalogue exists to enumerate
 * which keys to render, not to seed default state.
 */

export type EmailPrefEntry = {
  key: string;
  label: string;
  hint: string;
};

/**
 * Email types a CLIENT can receive. Types with no email template
 * (`project_completed`) or that are admin-only (`new_lead`,
 * `contract_signed`, `revision_requested`, `proposal_accepted`,
 * admin-side `invite`) are intentionally excluded.
 */
export const CLIENT_EMAIL_PREFS = [
  {
    key: 'message',
    label: 'New messages',
    hint: 'When the team sends you a message in the portal.',
  },
  {
    key: 'invoice_sent',
    label: 'New invoices',
    hint: 'When a new invoice is ready for payment.',
  },
  {
    key: 'invoice_paid',
    label: 'Payment receipts',
    hint: 'Confirmation when a payment is successfully processed.',
  },
  {
    key: 'invoice_overdue',
    label: 'Overdue reminders',
    hint: 'Nudges when an invoice is past its due date.',
  },
  {
    key: 'contract_pending_client_signature',
    label: 'Agreement ready to sign',
    hint: 'When we send you an agreement to review and sign.',
  },
  {
    key: 'agreement_withdrawn',
    label: 'Agreement changes',
    hint: 'When we withdraw an agreement we sent you, or void a signed one.',
  },
  {
    key: 'agreement_reminder',
    label: 'Agreement reminders',
    hint: 'A nudge when an agreement is waiting on your signature or about to expire.',
  },
  {
    key: 'change_order',
    label: 'Change orders',
    hint: 'When a change to your project is ready for your signature.',
  },
  {
    key: 'milestone_updated',
    label: 'Milestone updates',
    hint: 'When a project milestone changes status.',
  },
  {
    key: 'revision_updated',
    label: 'Revision updates',
    hint: 'When the team replies to or updates one of your revision requests.',
  },
  {
    key: 'care_plan_activated',
    label: 'Care plan activation',
    hint: 'Confirmation when your care plan subscription becomes active.',
  },
] as const satisfies readonly EmailPrefEntry[];

/**
 * Email types an ADMIN can receive. Excludes invite (no admin path),
 * project_completed (no template), and client-direction confirmations
 * like proposal_accepted_client / contract_pending_client_signature /
 * revision_updated / care_plan_activated / invoice_overdue (those go to
 * clients only).
 */
export const ADMIN_EMAIL_PREFS = [
  {
    key: 'message',
    label: 'New messages',
    hint: 'Email when a client replies in a project thread.',
  },
  {
    key: 'invoice_sent',
    label: 'Invoice sent',
    hint: 'Email when an invoice is dispatched via Stripe.',
  },
  {
    key: 'payment_received',
    label: 'Payment received',
    hint: 'Email when a client payment clears.',
  },
  {
    key: 'payment_overdue',
    label: 'Payment overdue',
    hint: 'Email when a client payment fails or passes its due date.',
  },
  {
    key: 'new_lead',
    label: 'New lead',
    hint: 'Email when a new inquiry hits the leads inbox.',
  },
  {
    key: 'contract_signed',
    label: 'Agreement signed',
    hint: 'Email when a client signs an agreement.',
  },
  {
    key: 'change_order_update',
    label: 'Change orders',
    hint: 'Email when a client signs or declines a change order.',
  },
  {
    key: 'contract_billing_blocked',
    label: 'Billing blocked',
    hint: 'Email when an automatic invoice would bill past the signed contract.',
  },
  {
    key: 'agreement_changes_requested',
    label: 'Changes requested',
    hint: 'Email when a client asks for changes to an agreement instead of signing.',
  },
  {
    key: 'deposit_invoice_failed',
    label: 'Agreement follow-up failed',
    hint: "Email when a client signs but the deposit invoice couldn't be raised.",
  },
  {
    key: 'milestone_updated',
    label: 'Milestone update',
    hint: 'Email when a milestone changes state.',
  },
  {
    key: 'revision_requested',
    label: 'Revision request',
    hint: 'Email when a client files a revision or replies on one.',
  },
] as const satisfies readonly EmailPrefEntry[];
