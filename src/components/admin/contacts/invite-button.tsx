'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * Invite this contact to the client portal. Rendered on both lead and
 * client detail. If the contact already has `user_id` set, the parent
 * renders a "Portal access · active" pill instead.
 */
export function InviteToPortalButton({
  contactId,
  contactEmail,
  contactName,
}: {
  contactId: string;
  contactEmail: string | null;
  contactName: string;
}) {
  const router = useRouter();
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
        setError(j.error ?? 'Failed to send invite.');
        return;
      }
      setSent(true);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!contactEmail) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled
        title="Add an email to the contact first"
      >
        Invite to portal
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
        {sent ? 'Invite sent' : 'Invite to portal'}
      </Button>

      <ConfirmDialog
        open={open}
        tone="default"
        title="Send portal invite?"
        description={
          <>
            We&apos;ll email <span className="font-mono text-ink">{contactEmail}</span>{' '}
            an invite for <span className="font-mono text-ink">{contactName}</span> to
            access their LuxWeb Studio portal. They can accept proposals,
            download files, and pay invoices from there.
            {error ? (
              <span className="mt-2 block font-mono text-xs text-danger">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Send invite"
        busy={busy}
        onCancel={() => (busy ? undefined : setOpen(false))}
        onConfirm={send}
      />
    </>
  );
}
