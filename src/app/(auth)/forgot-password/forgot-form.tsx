'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
            Check your email
          </h1>
          <p className="font-sans text-sm text-ink-muted">
            If an account exists for{' '}
            <span className="font-mono text-ink">{email}</span>, a reset link is
            on its way.
          </p>
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

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Forgot password
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p role="alert" className="font-sans text-xs text-danger">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="block text-center font-sans text-xs text-ink-muted hover:text-copper"
      >
        ← Back to sign in
      </Link>
    </div>
  );
}
