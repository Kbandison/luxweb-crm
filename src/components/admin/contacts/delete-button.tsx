'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * Delete a contact (lead or client). Cascades to all linked deals,
 * projects, invoices, proposals, and notes via the FK constraints in
 * crm_schema.sql, so the confirm copy calls that out explicitly.
 *
 * `redirectTo` controls where the admin lands after a successful
 * delete — the list view for whichever surface they came from.
 */
export function DeleteContactButton({
  contactId,
  contactName,
  kind,
  redirectTo,
}: {
  contactId: string;
  contactName: string;
  kind: 'lead' | 'client';
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to delete.');
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
      >
        Delete {kind}
      </button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title={`Delete ${contactName}?`}
        description={
          <>
            This permanently removes the contact record along with every{' '}
            <span className="text-ink">deal, project, proposal, invoice,
            note, and portal-access link</span>{' '}
            attached to them. This can&apos;t be undone.
            {error ? (
              <span className="mt-3 block font-mono text-xs text-danger">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Delete everything"
        busy={busy}
        onCancel={() => (busy ? undefined : setOpen(false))}
        onConfirm={confirmDelete}
      />
    </>
  );
}
