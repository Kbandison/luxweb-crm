'use client';
import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin error boundary]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-danger">
        Something broke
      </p>
      <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
        We hit an unexpected error.
      </h1>
      <p className="mt-3 max-w-md font-sans text-sm text-ink-muted">
        The team has been notified (via the browser console for now; Sentry
        once it&apos;s wired). Try again, and if it keeps happening, the details
        below help us track it down.
      </p>
      {error.digest ? (
        <p className="mt-4 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[11px] tabular-nums text-ink-subtle">
          digest · {error.digest}
        </p>
      ) : null}
      <div className="copper-rule mt-8 h-px w-24" />
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center rounded-md bg-copper px-4 py-2 font-sans text-sm font-medium text-copper-foreground transition-colors hover:bg-copper/90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
