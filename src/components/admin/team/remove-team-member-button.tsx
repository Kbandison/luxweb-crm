'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';

/**
 * Remove a team member from the roster. If they had a login, removal revokes
 * their internal access (their crm.users role is downgraded server-side).
 * For a temporary hide, set status to Inactive instead.
 */
export function RemoveTeamMemberButton({
  teamMemberId,
  fullName,
  hasLogin,
}: {
  teamMemberId: string;
  fullName: string;
  hasLogin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/team/${teamMemberId}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't remove", body.error ?? 'Try again.');
        setBusy(false);
        return;
      }
      toast.success('Removed', `${fullName} was removed from the team.`);
      router.push('/admin/team');
      router.refresh();
    } catch {
      toast.error("Couldn't remove", 'Network error. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        title={`Remove ${fullName}?`}
        description={
          hasLogin
            ? 'This removes them from the roster and revokes their login access. Their assignments are deleted. To keep the record but hide them, set status to Inactive instead.'
            : 'This removes them from the roster and deletes their project assignments.'
        }
        confirmLabel="Remove"
        tone="danger"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
