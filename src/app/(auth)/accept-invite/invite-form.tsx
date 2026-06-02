'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';

type State =
  | { kind: 'verifying' }
  | { kind: 'ready'; name: string }
  | { kind: 'error'; message: string };

/**
 * Invite acceptance. The studio uses magic-link / Google sign-in (no password
 * login), and the client's name is already on their contact, so there's
 * nothing for them to fill in: we verify the link, mark the invite accepted
 * (user_metadata.onboarded_at → the admin "Portal access" signal), and send
 * them into the portal.
 */
export function InviteForm({
  tokenHash,
  type,
}: {
  tokenHash: string | null;
  type: string | null;
}) {
  const [state, setState] = useState<State>(() =>
    tokenHash
      ? { kind: 'verifying' }
      : {
          kind: 'error',
          message: 'Missing invite token. Use the link from your email.',
        },
  );
  const router = useRouter();

  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    const supabase = supabaseBrowser();
    // First-time invites arrive as type 'invite'; resends as 'magiclink'.
    const otpType: EmailOtpType = type === 'magiclink' ? 'magiclink' : 'invite';
    (async () => {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (cancelled) return;
      if (error) {
        setState({ kind: 'error', message: error.message });
        return;
      }
      // Mark the invite accepted. No password — sign-in is magic-link / Google.
      await supabase.auth.updateUser({
        data: { onboarded_at: new Date().toISOString() },
      });
      if (cancelled) return;
      const meta = data.user?.user_metadata as { full_name?: string } | undefined;
      setState({ kind: 'ready', name: meta?.full_name ?? '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenHash, type]);

  if (state.kind === 'verifying') {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Verifying your invite…
        </h1>
        <p className="font-sans text-sm text-ink-muted">One moment.</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
            Invite link expired
          </h1>
          <p className="font-sans text-sm text-danger">{state.message}</p>
        </header>
        <Link
          href="/login"
          className="font-sans text-xs text-copper hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  const firstName = state.name.trim().split(/\s+/)[0] ?? '';
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          You&apos;re in{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Your portal access is all set. You can sign in any time with a magic
          link or Google — no password needed.
        </p>
      </header>

      <Button
        type="button"
        className="w-full"
        onClick={() => router.replace('/')}
      >
        Enter your portal
      </Button>
    </div>
  );
}
