import type { PortalAccessStatus } from '@/lib/queries/admin';
import { InviteToPortalButton } from './invite-button';

/**
 * Renders a contact's portal state + the matching action:
 *   - none    → "Invite to portal" button
 *   - invited → amber "Invited · pending" pill + "Resend invite"
 *   - active  → green "Portal access" pill + "Resend invite"
 *
 * The pill no longer claims access the moment an invite is sent — see
 * getPortalAccessStatus().
 */
export function PortalAccessControl({
  status,
  contactId,
  contactEmail,
  contactName,
}: {
  status: PortalAccessStatus;
  contactId: string;
  contactEmail: string | null;
  contactName: string;
}) {
  if (status === 'none') {
    return (
      <InviteToPortalButton
        contactId={contactId}
        contactEmail={contactEmail}
        contactName={contactName}
      />
    );
  }

  const active = status === 'active';
  return (
    <>
      <span
        className={
          active
            ? 'inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-meta text-success'
            : 'inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-meta text-warning'
        }
      >
        <span
          className={
            active ? 'h-1 w-1 rounded-full bg-success' : 'h-1 w-1 rounded-full bg-warning'
          }
          aria-hidden
        />
        {active ? 'Portal access' : 'Invited · pending'}
      </span>
      <InviteToPortalButton
        contactId={contactId}
        contactEmail={contactEmail}
        contactName={contactName}
        mode="resend"
      />
    </>
  );
}
