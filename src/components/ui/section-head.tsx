import { cn } from '@/lib/utils';

export type SectionHeadProps = {
  number?: string;
  title: string;
  description?: string;
  right?: React.ReactNode;
  size?: 'md' | 'lg';
  className?: string;
};

const NUMBER_SIZE = {
  md: 'text-lg',
  lg: 'text-xl',
} as const;

const BAR_SIZE = {
  md: 'h-3.5',
  lg: 'h-4',
} as const;

const TITLE_SIZE = {
  md: 'text-lg',
  lg: 'text-xl',
} as const;

export function SectionHead({
  number,
  title,
  description,
  right,
  size = 'md',
  className,
}: SectionHeadProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <div className="flex items-center gap-3">
          {number ? (
            <>
              <span
                className={cn(
                  'font-mono font-semibold tabular-nums text-copper',
                  NUMBER_SIZE[size],
                )}
              >
                {number}
              </span>
              <span aria-hidden className={cn('w-px bg-copper/40', BAR_SIZE[size])} />
            </>
          ) : null}
          <h2
            className={cn(
              'font-display font-medium tracking-tight text-ink',
              TITLE_SIZE[size],
            )}
          >
            {title}
          </h2>
        </div>
        {description ? (
          <p className="mt-1.5 max-w-2xl font-sans text-sm text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {right ? <div className="flex items-baseline gap-2">{right}</div> : null}
    </div>
  );
}
