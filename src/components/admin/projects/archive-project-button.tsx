'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function ArchiveProjectButton({
  projectId,
  archived,
}: {
  projectId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archived_at: archived ? null : new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? 'Failed');
        return;
      }
      router.refresh();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={busy}
      >
        {archived ? 'Unarchive' : 'Archive'}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={archived ? 'Unarchive this project?' : 'Archive this project?'}
        description={
          archived
            ? 'Brings the project back into the default list.'
            : 'Hides this project from the default Projects list. The record stays, and the client portal still sees it. Use for completed projects you want out of your daily view.'
        }
        confirmLabel={archived ? 'Unarchive' : 'Archive'}
        busy={busy}
        onConfirm={go}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
