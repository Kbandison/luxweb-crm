import { cn } from '@/lib/utils';

export function ComingSoon({
  title,
  description,
  step,
  className,
}: {
  title: string;
  description: string;
  step: string;
  className?: string;
}) {
  return (
    <main className={cn('mx-auto w-full max-w-3xl px-8 py-16', className)}>
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 text-copper/70"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
            {step}
          </p>
          <p className="font-display text-xl font-medium text-ink">{title}</p>
          <p className="mx-auto max-w-md font-sans text-sm text-ink-muted">
            {description}
          </p>
        </div>
      </div>
    </main>
  );
}
