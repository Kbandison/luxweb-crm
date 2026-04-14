import Link from 'next/link';

export default function ClientNotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
        404
      </p>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight text-ink md:text-5xl">
        Not found.
      </h1>
      <p className="mt-3 max-w-md font-sans text-sm text-ink-muted">
        That page doesn&apos;t exist or isn&apos;t visible to you. If you think
        this is wrong, reach out to the LuxWeb team.
      </p>
      <div className="copper-rule mt-8 h-px w-24" />
      <Link
        href="/portal/dashboard"
        className="mt-6 inline-flex items-center rounded-md bg-copper px-4 py-2 font-sans text-sm font-medium text-copper-foreground transition-colors hover:bg-copper/90"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
