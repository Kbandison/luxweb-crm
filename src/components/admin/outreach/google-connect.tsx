'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Owner-facing Google connection control on /admin/outreach: the calendar
 * for booked calls, and Gmail sending for outreach email. A connection made
 * before sending existed is calendar-only until it's reconnected.
 */
export function GoogleConnect({
  connected,
  email,
  canSendEmail,
  configured,
  canConnect,
}: {
  connected: boolean;
  email: string | null;
  canSendEmail: boolean;
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
      toast.success('Google disconnected');
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
        <p className="font-sans text-sm font-medium text-ink">Google</p>
        <p className="mt-0.5 font-sans text-xs text-ink-muted">
          {!configured
            ? 'Not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
            : !connected
              ? 'Connect so booked appointments land on your calendar with invites, and outreach email sends from your Gmail.'
              : canSendEmail
                ? `Connected${email ? ` as ${email}` : ''}. Booked meetings sync here, and outreach email sends from this account.`
                : `Connected${email ? ` as ${email}` : ''}. Booked meetings sync here. Reconnect to let outreach email send from this account.`}
        </p>
      </div>
      {configured && canConnect ? (
        connected ? (
          <div className="flex items-center gap-2">
            {canSendEmail ? null : (
              <a href="/api/admin/google/connect" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                Reconnect
              </a>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={disconnect} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <a href="/api/admin/google/connect" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
            Connect
          </a>
        )
      ) : null}
    </div>
  );
}
