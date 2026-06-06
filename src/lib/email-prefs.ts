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
    key: 'proposal_sent',
    label: 'New proposals',
    hint: 'When a proposal is ready for your review.',
  },
  {
    key: 'proposal_accepted_client',
    label: 'Proposal confirmations',
    hint: 'Your own confirmation after you accept a proposal.',
  },
  {
    key: 'contract_pending_client_signature',
    label: 'Agreement ready to sign',
    hint: 'When we counter-sign and the agreement is waiting on you.',
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
    key: 'proposal_sent',
    label: 'Proposal sent',
    hint: 'Email when a proposal is shared with a client.',
  },
  {
    key: 'proposal_accepted',
    label: 'Proposal accepted',
    hint: 'Email when a client signs a proposal.',
  },
  {
    key: 'new_lead',
    label: 'New lead',
    hint: 'Email when a new inquiry hits the leads inbox.',
  },
  {
    key: 'contract_signed',
    label: 'Contract signed',
    hint: 'Email when a client counter-signs the agreement.',
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
