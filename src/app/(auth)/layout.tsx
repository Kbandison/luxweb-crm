import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';

// Split Screen shell: form card left, brand panel right.
// The brand panel is the page's one decorative copper moment; the form
// side stays quiet. Brand panel is hidden below md breakpoint.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-2">
      {/* Form side */}
      <div className="relative flex flex-col px-6 py-10 md:px-12 md:py-12">
        <Link href="/" className="inline-block">
          <Wordmark size="sm" />
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          © LuxWeb Studio
        </p>
      </div>

      {/* Brand panel — the copper moment */}
      <aside className="relative isolate hidden overflow-hidden border-l border-border bg-surface copper-mesh md:flex md:flex-col md:justify-between md:p-12">
        <Wordmark size="md" />

        <div className="space-y-5">
          <div className="copper-rule h-px w-24" />
          <p className="font-display text-4xl font-medium leading-tight tracking-tight text-ink">
            Proposals, milestones, and invoices
            <span className="text-ink-muted"> — all in one quiet view.</span>
          </p>
          <p className="max-w-sm font-sans text-sm leading-relaxed text-ink-muted">
            This portal is invite-only. Access comes from the LuxWeb Studio
            team — if you don&apos;t have an invite, reach out to Kevin.
          </p>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          portal.luxwebstudio.dev
        </p>
      </aside>
    </div>
  );
}
