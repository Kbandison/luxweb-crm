import { cn } from '@/lib/utils';

type Trend = 'up' | 'down' | 'flat';

export type MetricTileProps = {
  label: string;
  value: string;
  unit?: string;
  delta?: { value: string; trend: Trend; hint?: string };
  className?: string;
  /**
   * Whether this tile carries the page's one decorative copper moment.
   * Only one tile per surface should set this.
   */
  accent?: boolean;
};

const trendGlyph: Record<Trend, string> = {
  up: '↑',
  down: '↓',
  flat: '—',
};

export function MetricTile({
  label,
  value,
  unit,
  delta,
  accent = false,
  className,
}: MetricTileProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-surface p-6',
        'transition-colors duration-300 hover:border-border-strong',
        className,
      )}
    >
      {accent ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-copper/25 via-gold/10 to-transparent blur-3xl"
        />
      ) : null}

      <p className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-5xl font-medium leading-none tracking-tight tabular-nums text-ink">
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-sm text-ink-muted">{unit}</span>
        ) : null}
      </div>

      {delta ? (
        <div className="mt-4 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums',
              delta.trend === 'up' && 'bg-success/10 text-success',
              delta.trend === 'down' && 'bg-danger/10 text-danger',
              delta.trend === 'flat' && 'bg-ink/5 text-ink-muted',
            )}
          >
            <span aria-hidden>{trendGlyph[delta.trend]}</span>
            {delta.value}
          </span>
          {delta.hint ? (
            <span className="font-sans text-xs text-ink-muted">{delta.hint}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
