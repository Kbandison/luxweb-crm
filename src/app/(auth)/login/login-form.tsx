'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'password' | 'magic';

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return setError(error.message);
      // Root page reads session, redirects by role.
      startTransition(() => router.replace('/'));
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) return setError(error.message);
      setNotice(`Check ${email} for a sign-in link.`);
    }
  }

  async function onGoogle() {
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Sign in
        </h1>
        <p className="font-sans text-sm text-ink-muted">
          Access your LuxWeb Studio portal.
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

        {mode === 'password' && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="font-sans text-xs text-copper hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="font-sans text-xs text-danger"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="font-sans text-xs text-success">{notice}</p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {mode === 'password' ? 'Sign in' : 'Send magic link'}
        </Button>
      </form>

      <div className="relative flex items-center">
        <span className="h-px flex-1 bg-border" />
        <span className="px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-subtle">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={onGoogle}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'magic' : 'password');
            setError(null);
            setNotice(null);
          }}
          className="font-sans text-xs text-ink-muted hover:text-copper"
        >
          {mode === 'password'
            ? 'Email me a magic link instead'
            : 'Use password instead'}
        </button>
      </div>

      <p className="border-t border-border pt-6 font-sans text-xs text-ink-subtle">
        Access is invite-only. Reach out to Kevin if you need one.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 18 18"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.614Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.71H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}
