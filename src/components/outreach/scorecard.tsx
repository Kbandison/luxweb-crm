import { cn } from '@/lib/utils';
import type { OutreachSettings, PeriodStats } from '@/lib/queries/outreach';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Tile({
  label,
  value,
  target,
  hit,
}: {
  label: string;
  value: string | number;
  target?: string | number;
  hit?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-ink">
        {value}
        {target != null ? (
          <span
            className={cn(
              'ml-1 text-sm font-normal',
              hit ? 'text-success' : 'text-ink-subtle',
            )}
          >
            / {target}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Daily Numbers + weekly scorecard, from the tracker sheet. `variant` only
 * changes the header copy — the tiles are the same metrics.
 */
export function Scorecard({
  today,
  week,
  settings,
}: {
  today: PeriodStats;
  week: PeriodStats;
  settings: OutreachSettings;
}) {
  const weeklyDialTarget = settings.dailyDialTarget * 5;
  const onTrack =
    week.booked >= settings.weeklyBookedTarget &&
    week.dials >= Math.round(weeklyDialTarget * 0.8);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-meta text-ink-muted">
          Today
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Tile
            label="Dials"
            value={today.dials}
            target={settings.dailyDialTarget}
            hit={today.dials >= settings.dailyDialTarget}
          />
          <Tile label="Conversations" value={today.conversations} />
          <Tile label="Booked" value={today.booked} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
            This week
          </p>
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-meta-tight',
              onTrack ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
            )}
          >
            {onTrack ? 'On track' : 'Behind'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Dials"
            value={week.dials}
            target={weeklyDialTarget}
            hit={week.dials >= weeklyDialTarget}
          />
          <Tile
            label="Booked"
            value={week.booked}
            target={settings.weeklyBookedTarget}
            hit={week.booked >= settings.weeklyBookedTarget}
          />
          <Tile label="Contact rate" value={pct(week.contactRate)} />
          <Tile label="Book rate" value={pct(week.bookRate)} />
        </div>
      </div>
    </div>
  );
}
