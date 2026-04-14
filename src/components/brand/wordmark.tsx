import { cn } from '@/lib/utils';

export type WordmarkProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizes = {
  sm: { dot: 'h-1.5 w-1.5', text: 'text-base' },
  md: { dot: 'h-2 w-2', text: 'text-xl' },
  lg: { dot: 'h-2.5 w-2.5', text: 'text-3xl' },
} as const;

// The copper dot serves as the mark. Quiet, intentional, recognizable.
export function Wordmark({ className, size = 'md' }: WordmarkProps) {
  const s = sizes[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn('rounded-full bg-copper', s.dot)} aria-hidden />
      <span
        className={cn(
          'font-display font-medium tracking-tight text-ink',
          s.text,
        )}
      >
        LuxWeb Studio
      </span>
    </span>
  );
}
