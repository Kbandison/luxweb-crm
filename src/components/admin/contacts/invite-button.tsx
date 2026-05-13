'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

/**
 * Invite this contact to the client portal — works for both first-time
 * invites and resending a pending invite (auth user provisioned but
 * never accepted). The route decides which Supabase action runs.
 * Pass `mode="resend"` when the contact already has a user_id but hasn't
 * accepted, so the button label and confirm copy match the action.
 */
export function InviteToPortalButton({
  contactId,
  contactEmail,
  contactName,
  mode = 'invite',
}: {
  contactId: string;
  contactEmail: string | null;
  contactName: string;
  mode?: 'invite' | 'resend';
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}/invite`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to send invite.';
        setError(msg);
        toast.error("Couldn't send invite", msg);
        return;
      }
      setSent(true);
      setOpen(false);
      toast.success(mode === 'resend' ? 'Invite resent' : 'Lead invited');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const isResend = mode === 'resend';
  const idleLabel = isResend ? 'Resend invite' : 'Invite to portal';
  const sentLabel = isResend ? 'Invite resent' : 'Invite sent';

  if (!contactEmail) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled
        title="Add an email to the contact first"
      >
        {idleLabel}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        {sent ? sentLabel : idleLabel}
      </Button>

      <ConfirmDialog
        open={open}
        tone="default"
        title={isResend ? 'Resend portal invite?' : 'Send portal invite?'}
        description={
          <>
            {isResend ? (
              <>
                We&apos;ll re-send a fresh portal link to{' '}
                <span className="font-mono text-ink">{contactEmail}</span> for{' '}
                <span className="font-mono text-ink">{contactName}</span>. Use
                this when the first invite didn&apos;t arrive or expired.
              </>
            ) : (
              <>
                We&apos;ll email{' '}
                <span className="font-mono text-ink">{contactEmail}</span> an
                invite for{' '}
                <span className="font-mono text-ink">{contactName}</span> to
                access their LuxWeb Studio portal. They can accept proposals,
                download files, and pay invoices from there.
              </>
            )}
            {error ? (
              <span className="mt-2 block font-mono text-xs text-danger">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel={isResend ? 'Resend invite' : 'Send invite'}
        busy={busy}
        onCancel={() => (busy ? undefined : setOpen(false))}
        onConfirm={send}
      />
    </>
  );
}
