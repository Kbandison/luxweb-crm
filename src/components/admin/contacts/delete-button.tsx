'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

type Blockers = {
  contracts: number;
  carePlans: number;
  revisions: number;
};

/**
 * Delete a contact (lead or client). Two-stage confirm:
 *
 *   1. Standard confirm — proceeds normally if no legal-records FKs are
 *      pointing at the contact (deals/projects/proposals/invoices/notes
 *      cascade automatically).
 *   2. If contracts, care plan subs, or revisions exist, the API returns
 *      409 with counts and we open a second confirm with a heavier red
 *      warning. Only then can the admin force-delete + nuke the
 *      restrict-protected rows alongside the contact.
 *
 * `redirectTo` controls where the admin lands after success.
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
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Blockers | null>(null);

  async function attemptDelete(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const url = `/api/admin/contacts/${contactId}${force ? '?force=true' : ''}`;
      const res = await fetch(url, { method: 'DELETE' });

      if (res.status === 409) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          blockers?: Blockers;
        };
        if (j.blockers) {
          // Hand off to the heavier force-delete confirm dialog.
          setOpen(false);
          setBlockers(j.blockers);
          return;
        }
        setError(j.error ?? 'Cannot delete.');
        toast.error("Couldn't delete contact", j.error ?? 'Cannot delete.');
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.error ?? 'Failed to delete.';
        setError(msg);
        toast.error(
          kind === 'lead' ? "Couldn't delete lead" : "Couldn't delete client",
          msg,
        );
        return;
      }

      toast.success(kind === 'lead' ? 'Lead deleted' : 'Client deleted');
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
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-meta text-ink-muted transition-colors hover:border-danger/40 hover:text-danger"
      >
        Delete {kind}
      </button>

      {/* Stage 1: standard confirm */}
      <ConfirmDialog
        open={open}
        tone="danger"
        title={`Delete ${contactName}?`}
        description={
          <>
            This permanently removes the contact record along with every{' '}
            <span className="text-ink">
              deal, project, proposal, invoice, note, and portal-access link
            </span>{' '}
            attached to them. This can&apos;t be undone.
            {error ? (
              <span className="mt-3 block font-mono text-xs text-danger">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Delete contact"
        busy={busy}
        onCancel={() => (busy ? undefined : setOpen(false))}
        onConfirm={() => attemptDelete(false)}
      />

      {/* Stage 2: force-delete confirm (legal records exist) */}
      <ConfirmDialog
        open={blockers !== null}
        tone="danger"
        title={`Wipe ${contactName} and all legal records?`}
        description={
          <>
            <span className="block font-sans text-sm text-ink">
              This contact has signed legal records that would normally
              survive a contact deletion. Forcing the delete will permanently
              destroy:
            </span>
            <ul className="mt-3 space-y-1 font-mono text-xs">
              {blockers && blockers.contracts > 0 ? (
                <li className="text-danger">
                  · {blockers.contracts} signed contract
                  {blockers.contracts === 1 ? '' : 's'}
                </li>
              ) : null}
              {blockers && blockers.carePlans > 0 ? (
                <li className="text-danger">
                  · {blockers.carePlans} care-plan subscription
                  {blockers.carePlans === 1 ? '' : 's'}
                </li>
              ) : null}
              {blockers && blockers.revisions > 0 ? (
                <li className="text-danger">
                  · {blockers.revisions} revision request
                  {blockers.revisions === 1 ? '' : 's'}
                </li>
              ) : null}
            </ul>
            <span className="mt-3 block font-sans text-sm text-ink-muted">
              For real client records you usually want to{' '}
              <span className="text-ink">void the contracts and cancel the
              care plan</span>{' '}
              first, then delete. The audit log will record this destruction
              event either way.
            </span>
          </>
        }
        confirmLabel="Delete everything"
        busy={busy}
        onCancel={() => (busy ? undefined : setBlockers(null))}
        onConfirm={() => attemptDelete(true)}
      />
    </>
  );
}
