import { cn } from '@/lib/utils';

export type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  adminOnly?: boolean;
  tooltip?: string;
  className?: string;
};

const BORDER_BY_TONE = {
  default: 'border-border',
  success: 'border-success/30',
  danger: 'border-danger/30',
  warning: 'border-warning/30',
} as const;

const VALUE_COLOR_BY_TONE = {
  default: 'text-ink',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
} as const;

const VALUE_SIZE = {
  sm: 'text-xl',
  md: 'text-2xl md:text-3xl',
  lg: 'text-3xl md:text-4xl',
} as const;

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  size = 'md',
  adminOnly = false,
  tooltip,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-5',
        BORDER_BY_TONE[tone],
        className,
      )}
      title={tooltip}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-meta text-ink-muted">
        {adminOnly ? <span aria-hidden>🔒 </span> : null}
        {label}
      </p>
      <p
        className={cn(
          'mt-3 font-mono font-medium tabular-nums tracking-tight',
          VALUE_SIZE[size],
          VALUE_COLOR_BY_TONE[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 font-sans text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
