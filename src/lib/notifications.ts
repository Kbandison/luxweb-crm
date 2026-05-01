import 'server-only';
import { createElement } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';

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
      type: 'milestone_updated';
      userId: string;
      milestoneId: string;
      milestoneTitle: string;
      projectId: string;
      projectName: string;
      status: 'pending' | 'in_progress' | 'done' | 'blocked';
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
    };

type EmailPrefs = Record<string, boolean>;

/* -------------------------------------------------------------------------
 * Dispatcher
 * ------------------------------------------------------------------------- */

/**
 * Writes an in-app notification row and, if email prefs allow, sends a
 * transactional email via Resend. Fails soft — a broken email provider
 * must never block the mutation that triggered it.
 */
export async function notify(event: NotifyEvent): Promise<void> {
  // 1. In-app notification — payload stores the full event for the bell UI
  try {
    await supabaseAdmin().from('notifications').insert({
      user_id: event.userId,
      type: event.type,
      payload: event,
    });
  } catch (err) {
    console.warn('[notify] failed to write notifications row:', err);
  }

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

  if (!user) return;

  // 3. Invite emails always go (opting out of your own invite doesn't
  //    make sense). All other types respect email_prefs.
  const prefKey = event.type;
  if (event.type !== 'invite' && user.email_prefs[prefKey] === false) {
    return;
  }

  // 4. Render + send
  try {
    const rendered = renderTemplate(event, user);
    if (!rendered) return;
    await sendEmail({
      to: user.email,
      subject: rendered.subject,
      react: rendered.react,
      tag: event.type,
    });
  } catch (err) {
    console.warn('[notify] failed to send email:', err);
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
        subject: invoicePaidSubject(props),
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

/** Resolve the single admin user id. Falls back gracefully when missing. */
export async function getAdminUserId(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
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
