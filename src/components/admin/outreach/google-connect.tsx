'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/** Owner-facing Google Calendar connection control on /admin/outreach. */
export function GoogleConnect({
  connected,
  email,
  configured,
  canConnect,
}: {
  connected: boolean;
  email: string | null;
  configured: boolean;
  canConnect: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/google/disconnect', { method: 'POST' });
      if (!res.ok) {
        toast.error("Couldn't disconnect", 'Try again.');
        return;
      }
      toast.success('Calendar disconnected');
      router.refresh();
    } catch {
      toast.error("Couldn't disconnect", 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
      <div>
        <p className="font-sans text-sm font-medium text-ink">Google Calendar</p>
        <p className="mt-0.5 font-sans text-xs text-ink-muted">
          {!configured
            ? 'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
            : connected
              ? `Connected${email ? ` as ${email}` : ''}. Booked meetings sync here.`
              : 'Connect so booked appointments land on your calendar with invites.'}
        </p>
      </div>
      {configured && canConnect ? (
        connected ? (
          <Button type="button" variant="secondary" size="sm" onClick={disconnect} disabled={busy}>
            {busy ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : (
          <a href="/api/admin/google/connect" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Connect
          </a>
        )
      ) : null}
    </div>
  );
}
