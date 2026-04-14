import { cn } from '@/lib/utils';

export type LeadScoreSize = 'sm' | 'md';

export function LeadScore({
  score,
  size = 'sm',
}: {
  score: number;
  size?: LeadScoreSize;
}) {
  const tier = tierOf(score);
  const fill = {
    hot: 'bg-copper',
    warm: 'bg-warning',
    cool: 'bg-info',
    cold: 'bg-ink-subtle',
  }[tier];
  const barWidth = size === 'md' ? 'w-20' : 'w-12';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <div
      role="img"
      aria-label={`Lead score ${score} of 100`}
      className="flex items-center gap-2"
    >
      <div className={cn('relative h-1 overflow-hidden rounded-full bg-border', barWidth)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', fill)}
          style={{ width: `${Math.max(score, 2)}%` }}
        />
      </div>
      <span
        className={cn(
          'font-mono tabular-nums text-ink',
          textSize,
          tier === 'hot' && 'font-medium',
        )}
      >
        {score}
      </span>
    </div>
  );
}

function tierOf(score: number): 'hot' | 'warm' | 'cool' | 'cold' {
  if (score >= 76) return 'hot';
  if (score >= 51) return 'warm';
  if (score >= 26) return 'cool';
  return 'cold';
}
