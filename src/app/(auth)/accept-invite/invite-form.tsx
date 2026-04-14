'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type State =
  | { kind: 'verifying' }
  | { kind: 'ready'; email: string }
  | { kind: 'saving'; email: string }
  | { kind: 'error'; message: string };

export function InviteForm({ tokenHash }: { tokenHash: string | null }) {
  const [state, setState] = useState<State>(() =>
    tokenHash
      ? { kind: 'verifying' }
      : {
          kind: 'error',
          message: 'Missing invite token. Use the link from your email.',
        },
  );
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (!tokenHash) return;
    let cancelled = false;
    supabaseBrowser()
      .auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ kind: 'error', message: error.message });
          return;
        }
        setState({ kind: 'ready', email: data.user?.email ?? '' });
      });
    return () => {
      cancelled = true;
    };
  }, [tokenHash]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind !== 'ready') return;
    if (password.length < 8) {
      setState({ kind: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }
    setState({ kind: 'saving', email: state.email });
    const { error } = await supabaseBrowser().auth.updateUser({
      password,
      data: { full_name: fullName },
    });
    if (error) {
      setState({ kind: 'error', message: error.message });
      return;
    }
    router.replace('/');
  }

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

  const busy = state.kind === 'saving';

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Welcome
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Setting up access for{' '}
          <span className="font-mono text-ink">{state.email}</span>.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="font-sans text-xs text-ink-subtle">
            At least 8 characters.
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Setting up…' : 'Finish setup'}
        </Button>
      </form>
    </div>
  );
}
