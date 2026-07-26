'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { PortalAccessStatus } from '@/lib/queries/admin';

/**
 * Send / resend a team-workspace invite. Mirrors the client "Invite to portal"
 * button. Disabled (with a hint) when the member has no email on file.
 */
export function InviteTeamMemberButton({
  teamMemberId,
  hasEmail,
  accessStatus,
}: {
  teamMemberId: string;
  hasEmail: boolean;
  accessStatus: PortalAccessStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const label =
    accessStatus === 'active'
      ? 'Resend access link'
      : accessStatus === 'invited'
        ? 'Resend invite'
        : 'Invite to workspace';

  async function invite() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/team/${teamMemberId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't send invite", body.error ?? 'Try again.');
        return;
      }
      toast.success(
        body.resend ? 'Invite resent' : 'Invite sent',
        'A sign-in link is on its way.',
      );
      router.refresh();
    } catch {
      toast.error("Couldn't send invite", 'Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!hasEmail) {
    return (
      <Button variant="secondary" size="sm" disabled title="Add an email first">
        Invite to workspace
      </Button>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={invite} disabled={busy}>
      {busy ? 'Sending…' : label}
    </Button>
  );
}
