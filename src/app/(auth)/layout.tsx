import Link from 'next/link';
import { Wordmark } from '@/components/brand/wordmark';
import { STUDIO } from '@/lib/brand';

// Split Screen shell: form card left, brand panel right.
// The brand panel is the page's one decorative copper moment; the form
// side stays quiet. Brand panel is hidden below md breakpoint.
//
// The wordmark shows once per breakpoint, never twice: the form-side one is
// mobile's only branding and hides at md, where the panel takes over. The
// invite-only line lives on the form (it's actionable and shows at every
// width), so the panel doesn't repeat it.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-2">
      {/* Form side */}
      <div className="relative flex flex-col px-6 py-10 md:px-12 md:py-12">
        <Link href="/" className="inline-block md:hidden">
          <Wordmark size="sm" />
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
          © {STUDIO.legalName}
        </p>
      </div>

      {/* Brand panel — the copper moment */}
      <aside className="relative isolate hidden overflow-hidden border-l border-border bg-surface copper-mesh md:flex md:flex-col md:justify-between md:p-12">
        <Link href="/" className="inline-block">
          <Wordmark size="md" />
        </Link>

        <div className="space-y-5">
          <div className="copper-rule h-px w-24" />
          <p className="font-display text-4xl font-medium leading-tight tracking-tight text-ink">
            Proposals, milestones, and invoices
            <span className="text-ink-muted"> — all in one quiet view.</span>
          </p>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-meta-tight text-ink-subtle">
          {STUDIO.portal}
        </p>
      </aside>
    </div>
  );
}
