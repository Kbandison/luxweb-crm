import 'server-only';
import { createElement } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail, type EmailCategory } from '@/lib/resend';

import InvoiceSentEmail, {
  invoiceSentSubject,
} from '@/emails/invoice-sent-email';
import InvoicePaidEmail, {
  invoicePaidSubject,
} from '@/emails/invoice-paid-email';
import InvoiceOverdueEmail, {
  invoiceOverdueSubject,
} from '@/emails/invoice-overdue-email';
import ProposalSentEmail, {
  proposalSentSubject,
} from '@/emails/proposal-sent-email';
import ProposalAcceptedEmail, {
  proposalAcceptedSubject,
} from '@/emails/proposal-accepted-email';
import ProposalAcceptedClientEmail, {
  proposalAcceptedClientSubject,
} from '@/emails/proposal-accepted-client-email';
import MilestoneUpdatedEmail, {
  milestoneUpdatedSubject,
} from '@/emails/milestone-updated-email';
import InviteEmail, { inviteSubject } from '@/emails/invite-email';
import NewLeadEmail, { newLeadSubject } from '@/emails/new-lead-email';
import ContractSignedEmail, {
  contractSignedSubject,
} from '@/emails/contract-signed-email';
import RevisionRequestedEmail, {
  revisionRequestedSubject,
} from '@/emails/revision-requested-email';
import RevisionUpdatedEmail, {
  revisionUpdatedSubject,
} from '@/emails/revision-updated-email';
import CarePlanActivatedEmail, {
  carePlanActivatedSubject,
} from '@/emails/care-plan-activated-email';
import ContractPendingClientSignatureEmail, {
  contractPendingClientSignatureSubject,
} from '@/emails/contract-pending-client-signature-email';

/* -------------------------------------------------------------------------
 * Event shapes
 * ------------------------------------------------------------------------- */

export type NotifyEvent =
  | {
      type: 'invoice_sent';
      userId: string;
      invoiceId: string;
      description: string;
      amountCents: number;
      dueDate?: string | null;
      hostedInvoiceUrl: string;
      /** in-app path to the invoices list (recipient-contextualized) */
      invoicePath: string;
    }
  | {
      type: 'invoice_paid';
      userId: string;
      invoiceId: string;
      description: string;
      amountCents: number;
      paidAt: string;
      hostedInvoiceUrl?: string | null;
      /** in-app path to the invoices list (recipient-contextualized) */
      invoicePath: string;
    }
  | {
      type: 'invoice_overdue';
      userId: string;
      invoiceId: string;
      description: string;
      amountCents: number;
      dueDate?: string | null;
      hostedInvoiceUrl?: string | null;
      /** in-app path to the invoices list (recipient-contextualized) */
      invoicePath: string;
    }
  | {
      type: 'message';
      userId: string;
      projectId: string;
      threadId: string;
      senderName: string;
      snippet: string;
      /** in-app path to the thread (recipient-contextualized) */
      threadPath: string;
    }
  | {
      type: 'proposal_sent';
      userId: string;
      proposalId: string;
      title: string;
      totalCents: number | null;
      /** absolute or relative URL; resolved against NEXT_PUBLIC_APP_URL */
      proposalPath: string;
    }
  | {
      type: 'proposal_accepted';
      /** admin user id (the one being notified) */
      userId: string;
      proposalId: string;
      title: string;
      totalCents: number | null;
      clientName: string;
      acceptedAt: string;
      /** admin-side URL */
      proposalPath: string;
    }
  | {
      type: 'proposal_accepted_client';
      /** client user id — confirmation email after they accept */
      userId: string;
      proposalId: string;
      title: string;
      totalCents: number | null;
      acceptedAt: string;
      /** client-side portal landing URL */
      portalPath: string;
    }
  | {
      type: 'milestone_updated';
      userId: string;
      milestoneId: string;
      milestoneTitle: string;
      projectId: string;
      projectName: string;
      status: 'inactive' | 'pending' | 'in_progress' | 'done' | 'blocked';
      /** path to the project workspace */
      projectPath: string;
    }
  | {
      type: 'invite';
      userId: string;
      /** email the invite was sent to (used for deduping in logs) */
      email: string;
      inviteUrl: string;
    }
  | {
      type: 'new_lead';
      userId: string;
      contactId: string;
      fullName: string;
      email: string | null;
      company: string | null;
      source: string | null;
      message: string | null;
      /** admin-side lead detail path */
      leadPath: string;
    }
  | {
      type: 'contract_signed';
      /** admin user id (the one being notified) */
      userId: string;
      contractId: string;
      proposalId: string;
      title: string;
      totalCents: number | null;
      clientName: string;
      signedAt: string;
      agreementVersion: string;
      /** admin-side URL */
      contractPath: string;
    }
  | {
      type: 'revision_requested';
      /** admin user id */
      userId: string;
      revisionId: string;
      title: string;
      bodySnippet: string;
      projectId: string;
      projectName: string;
      clientName: string;
      /** 'created' on initial filing, 'comment' on subsequent client replies */
      kind: 'created' | 'comment';
      /** admin-side URL */
      revisionPath: string;
    }
  | {
      type: 'revision_updated';
      /** client user id */
      userId: string;
      revisionId: string;
      title: string;
      projectId: string;
      projectName: string;
      /** 'status' for status changes, 'comment' for admin replies */
      kind: 'status' | 'comment';
      statusLabel?: string;
      snippet?: string;
      /** client-portal URL */
      revisionPath: string;
    }
  | {
      type: 'contract_pending_client_signature';
      /** client user id (the recipient) */
      userId: string;
      contractId: string;
      proposalId: string;
      clientName: string;
      /** client portal URL */
      contractPath: string;
    }
  | {
      type: 'care_plan_activated';
      /** client user id */
      userId: string;
      subscriptionId: string;
      projectId: string | null;
      projectName: string | null;
      amountCents: number;
      interval: 'month' | 'year';
      /** client-portal URL */
      portalPath: string;
    }
  | {
      type: 'project_completed';
      /** client user id */
      userId: string;
      projectId: string;
      projectName: string;
      /** client portal URL for the project overview (review card lives there) */
      projectPath: string;
    };

type EmailPrefs = Record<string, boolean>;

/* -------------------------------------------------------------------------
 * Dispatcher
 * ------------------------------------------------------------------------- */

/**
 * Writes an in-app notification row and, if email prefs allow, sends a
 * transactional email via Resend. Fails soft — a broken email provider
 * must never block the mutation that triggered it.
 *
 * Pass `{ inAppOnly: true }` to skip the email portion entirely — used
 * for admin-side fan-out notifications where the in-app bell is enough
 * and we don't want the admin receiving client-facing email copy.
 */
/**
 * Pick the stable identifier for the "subject" of a notification — the
 * thing the recipient cares about. Used to dedupe: if a new invite for
 * the SAME user, or a fresh Agreement-ready-to-sign for the SAME contract
 * arrives, the older unread row gets collapsed instead of stacking.
 *
 * Return null for event types where collapsing all unread of the same
 * type would lose information (we currently have none).
 */
function subjectKeyFor(event: NotifyEvent): { field: string; value: string } | null {
  switch (event.type) {
    case 'invite':
      return { field: 'userId', value: event.userId };
    case 'message':
      return { field: 'threadId', value: event.threadId };
    case 'milestone_updated':
      return { field: 'milestoneId', value: event.milestoneId };
    case 'proposal_sent':
    case 'proposal_accepted':
    case 'proposal_accepted_client':
      return { field: 'proposalId', value: event.proposalId };
    case 'invoice_sent':
    case 'invoice_paid':
    case 'invoice_overdue':
      return { field: 'invoiceId', value: event.invoiceId };
    case 'revision_requested':
    case 'revision_updated':
      return { field: 'revisionId', value: event.revisionId };
    case 'contract_pending_client_signature':
      return { field: 'contractId', value: event.contractId };
    case 'care_plan_activated':
      return { field: 'subscriptionId', value: event.subscriptionId };
    case 'project_completed':
      return { field: 'projectId', value: event.projectId };
    default:
      return null;
  }
}

/**
 * Which studio from-address each email sends from. Receipts/billing →
 * no-reply@, client project updates → updates@, message threads → chat@
 * (reserved; no chat email is sent yet), internal owner alerts → alerts@.
 */
const CATEGORY_BY_TYPE: Record<NotifyEvent['type'], EmailCategory> = {
  invoice_sent: 'receipt',
  invoice_paid: 'receipt',
  invoice_overdue: 'receipt',
  care_plan_activated: 'receipt',
  proposal_sent: 'update',
  proposal_accepted_client: 'update',
  contract_pending_client_signature: 'update',
  milestone_updated: 'update',
  revision_updated: 'update',
  invite: 'update',
  project_completed: 'update',
  message: 'chat',
  new_lead: 'admin',
  proposal_accepted: 'admin',
  contract_signed: 'admin',
  revision_requested: 'admin',
};

export async function notify(
  event: NotifyEvent,
  opts?: { inAppOnly?: boolean; actorId?: string | null },
): Promise<void> {
  // Self-skip: if the actor of an event is the same user as the
  // recipient, drop the notification entirely. Common in test setups
  // where a single account holds both admin + client roles — Regina
  // shouldn't be told "Regina filed a revision request" — but also
  // valid in prod (e.g. an admin marking their own action shouldn't
  // notify themselves).
  if (opts?.actorId && opts.actorId === event.userId) return;
  // 1. In-app notification — payload stores the full event for the bell UI.
  //    Collapse prior unread rows with the same (user, type, subject) so
  //    re-actions (resend invite, re-sign contract after void) replace
  //    rather than stack in the bell. Read rows are left alone.
  try {
    const sb = supabaseAdmin();
    const subject = subjectKeyFor(event);
    if (subject) {
      const { data: prior } = await sb
        .from('notifications')
        .select('id, payload')
        .eq('user_id', event.userId)
        .eq('type', event.type)
        .is('read_at', null);
      type Row = { id: string; payload: Record<string, unknown> | null };
      const priorIds = ((prior ?? []) as Row[])
        .filter(
          (r) =>
            r.payload &&
            (r.payload as Record<string, unknown>)[subject.field] === subject.value,
        )
        .map((r) => r.id);
      if (priorIds.length > 0) {
        await sb.from('notifications').delete().in('id', priorIds);
      }
    }
    await sb.from('notifications').insert({
      user_id: event.userId,
      type: event.type,
      payload: event,
    });
  } catch (err) {
    console.warn('[notify] failed to write notifications row:', err);
  }

  // In-app-only short-circuit. Used for admin fan-out so admins don't
  // receive the client-facing email copy (e.g., the "thank you for your
  // deposit" payment confirmation).
  if (opts?.inAppOnly) return;

  // 2. Look up recipient + email prefs
  let user: { email: string; full_name: string | null; email_prefs: EmailPrefs } | null =
    null;
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('email, full_name, email_prefs')
      .eq('id', event.userId)
      .single();
    if (data) {
      user = {
        email: data.email as string,
        full_name: (data.full_name as string | null) ?? null,
        email_prefs: (data.email_prefs as EmailPrefs) ?? {},
      };
    }
  } catch (err) {
    console.warn('[notify] failed to read user email prefs:', err);
  }

  if (!user) {
    console.warn(
      `[notify] no user row for userId=${event.userId} (type=${event.type}); email skipped`,
    );
    return;
  }
  if (!user.email) {
    console.warn(
      `[notify] user ${event.userId} has no email; ${event.type} email skipped`,
    );
    return;
  }

  // 3. Invite emails always go (opting out of your own invite doesn't
  //    make sense). All other types respect email_prefs.
  const prefKey = event.type;
  if (event.type !== 'invite' && user.email_prefs[prefKey] === false) {
    console.warn(
      `[notify] ${event.type} email opt-out for user=${event.userId}; skipped`,
    );
    return;
  }

  // 4. Render + send
  try {
    const rendered = renderTemplate(event, user);
    if (!rendered) {
      // Some types (e.g. message) intentionally have no email template.
      return;
    }
    const result = await sendEmail({
      to: user.email,
      subject: rendered.subject,
      react: rendered.react,
      tag: event.type,
      category: CATEGORY_BY_TYPE[event.type],
    });
    const messageId = (result as { data?: { id?: string } }).data?.id;
    if (messageId) {
      console.log(`[notify] sent ${event.type} email id=${messageId}`);
    } else {
      console.log(`[notify] sent ${event.type} email (no id returned)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[notify] failed to send ${event.type} email (user=${event.userId}): ${msg}`,
    );
  }
}

/* -------------------------------------------------------------------------
 * Template resolution
 * ------------------------------------------------------------------------- */

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  if (!base) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

function renderTemplate(
  event: NotifyEvent,
  user: { email: string; full_name: string | null },
): { subject: string; react: React.ReactElement } | null {
  const recipientName = user.full_name ?? user.email.split('@')[0];

  switch (event.type) {
    case 'invoice_sent': {
      // invoice_sent is always dispatched to the client, so the in-portal
      // pay URL is always the right CTA.
      const props = {
        recipientName,
        description: event.description,
        amountCents: event.amountCents,
        dueDate: event.dueDate ?? null,
        payUrl: appUrl(`${event.invoicePath}/${event.invoiceId}/pay`),
      };
      return {
        subject: invoiceSentSubject(props),
        react: createElement(InvoiceSentEmail, props),
      };
    }
    case 'invoice_paid': {
      const props = {
        recipientName,
        description: event.description,
        amountCents: event.amountCents,
        paidAt: event.paidAt,
        hostedInvoiceUrl: event.hostedInvoiceUrl ?? null,
      };
      return {
        subject: invoicePaidSubject(),
        react: createElement(InvoicePaidEmail, props),
      };
    }
    case 'proposal_sent': {
      const props = {
        recipientName,
        title: event.title,
        totalCents: event.totalCents,
        proposalUrl: appUrl(event.proposalPath),
      };
      return {
        subject: proposalSentSubject(props),
        react: createElement(ProposalSentEmail, props),
      };
    }
    case 'proposal_accepted': {
      const props = {
        adminName: recipientName,
        clientName: event.clientName,
        title: event.title,
        totalCents: event.totalCents,
        proposalUrl: appUrl(event.proposalPath),
        acceptedAt: event.acceptedAt,
      };
      return {
        subject: proposalAcceptedSubject(props),
        react: createElement(ProposalAcceptedEmail, props),
      };
    }
    case 'proposal_accepted_client': {
      const props = {
        recipientName,
        title: event.title,
        totalCents: event.totalCents,
        portalUrl: appUrl(event.portalPath),
        acceptedAt: event.acceptedAt,
      };
      return {
        subject: proposalAcceptedClientSubject(props),
        react: createElement(ProposalAcceptedClientEmail, props),
      };
    }
    case 'milestone_updated': {
      const props = {
        recipientName,
        projectName: event.projectName,
        milestoneTitle: event.milestoneTitle,
        status: event.status,
        projectUrl: appUrl(event.projectPath),
      };
      return {
        subject: milestoneUpdatedSubject(props),
        react: createElement(MilestoneUpdatedEmail, props),
      };
    }
    case 'invite': {
      const props = {
        recipientName,
        inviteUrl: event.inviteUrl,
      };
      return {
        subject: inviteSubject(),
        react: createElement(InviteEmail, props),
      };
    }
    case 'new_lead': {
      const props = {
        recipientName,
        fullName: event.fullName,
        email: event.email,
        company: event.company,
        source: event.source,
        message: event.message,
        leadUrl: appUrl(event.leadPath),
      };
      return {
        subject: newLeadSubject(props),
        react: createElement(NewLeadEmail, props),
      };
    }
    case 'message': {
      // No email template for messages — in-app bell + unread count only.
      return null;
    }
    case 'contract_signed': {
      const props = {
        adminName: recipientName,
        clientName: event.clientName,
        title: event.title,
        totalCents: event.totalCents,
        agreementVersion: event.agreementVersion,
        signedAt: event.signedAt,
        contractUrl: appUrl(event.contractPath),
      };
      return {
        subject: contractSignedSubject(props),
        react: createElement(ContractSignedEmail, props),
      };
    }
    case 'revision_requested': {
      const props = {
        adminName: recipientName,
        clientName: event.clientName,
        projectName: event.projectName,
        title: event.title,
        bodySnippet: event.bodySnippet,
        kind: event.kind,
        revisionUrl: appUrl(event.revisionPath),
      };
      return {
        subject: revisionRequestedSubject(props),
        react: createElement(RevisionRequestedEmail, props),
      };
    }
    case 'revision_updated': {
      const props = {
        recipientName,
        projectName: event.projectName,
        title: event.title,
        kind: event.kind,
        statusLabel: event.statusLabel,
        snippet: event.snippet,
        revisionUrl: appUrl(event.revisionPath),
      };
      return {
        subject: revisionUpdatedSubject(props),
        react: createElement(RevisionUpdatedEmail, props),
      };
    }
    case 'contract_pending_client_signature': {
      const props = {
        recipientName,
        contractUrl: appUrl(event.contractPath),
      };
      return {
        subject: contractPendingClientSignatureSubject(),
        react: createElement(ContractPendingClientSignatureEmail, props),
      };
    }
    case 'care_plan_activated': {
      const props = {
        recipientName,
        projectName: event.projectName,
        amountCents: event.amountCents,
        interval: event.interval,
        portalUrl: appUrl(event.portalPath),
      };
      return {
        subject: carePlanActivatedSubject(props),
        react: createElement(CarePlanActivatedEmail, props),
      };
    }
    case 'project_completed': {
      // In-app only — no email template yet. The dashboard tile + bell
      // already surface a strong nudge for the client to leave a review.
      return null;
    }
    case 'invoice_overdue': {
      // Only render a pay CTA when the recipient is a client (portal path).
      // Admin gets an informational overdue email with no pay button.
      const isClient = event.invoicePath.startsWith('/portal');
      const props = {
        recipientName,
        description: event.description,
        amountCents: event.amountCents,
        dueDate: event.dueDate ?? null,
        payUrl: isClient
          ? appUrl(`${event.invoicePath}/${event.invoiceId}/pay`)
          : null,
      };
      return {
        subject: invoiceOverdueSubject(props),
        react: createElement(InvoiceOverdueEmail, props),
      };
    }
  }
}

/* -------------------------------------------------------------------------
 * Helpers for common lookups
 * ------------------------------------------------------------------------- */

/**
 * Resolve a single admin user id (Postgres-ordered first row).
 *
 * @deprecated For notification fan-out, prefer {@link getAdminUserIds} so
 * every admin receives the event. This helper remains for callers that
 * genuinely need a single id (e.g. "the admin" of a scoped concept) and
/**
 * Resolve every admin user id. Returns `[]` if the lookup fails or no
 * admin exists. Use this for notification fan-out so multi-admin setups
 * route events to all staff, not just the Postgres-ordered first row.
 *
 * Single-admin case still works: the array has one element and callers
 * loop over it once with no behavior change.
 */
export async function getAdminUserIds(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('id')
      .eq('role', 'admin');
    const rows = (data ?? []) as Array<{ id: string }>;
    return rows.map((r) => r.id).filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

/** Find the client user_id linked to a contact (null if not invited yet). */
export async function getContactUserId(
  contactId: string,
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('contacts')
      .select('user_id')
      .eq('id', contactId)
      .single();
    return (data?.user_id as string | null) ?? null;
  } catch {
    return null;
  }
}
