'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Landed on from /auth/callback after the reset email's code exchange.
// Session is already established; just update the password and route home.
// Reached without a session (typed URL, stale tab), the update fails — say
// so plainly and point at a fresh link instead of a raw auth error.
export function ResetForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNoSession(false);
    if (password.length < 8) return setError('At least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error && isAuthSessionMissingError(error)) {
      setNoSession(true);
      return setError(
        'This reset link has expired or was opened in a different browser.',
      );
    }
    if (error) return setError(error.message);
    router.replace('/');
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          New password
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Pick a new password for your account.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
          />
        </div>

        {error && (
          <p role="alert" className="font-sans text-xs text-danger">
            {error}
            {noSession ? (
              <>
                {' '}
                <Link href="/forgot-password" className="text-copper hover:underline">
                  Request a new one
                </Link>
                .
              </>
            ) : null}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          Update password
        </Button>
      </form>
    </div>
  );
}
