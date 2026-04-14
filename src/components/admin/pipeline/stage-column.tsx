'use client';
import { useDroppable } from '@dnd-kit/core';
import type { DealCard as DealCardType, PipelineStage } from '@/lib/queries/admin';
import { cn } from '@/lib/utils';
import { DealCard } from './deal-card';
import { STAGE_DOT, STAGE_LABEL } from './stage-meta';
import { formatUSD } from '@/lib/formatters';

export function StageColumn({
  stage,
  deals,
}: {
  stage: PipelineStage;
  deals: DealCardType[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((s, d) => s + d.valueCents, 0);

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border bg-surface-2/40 transition-colors',
        isOver
          ? 'border-copper/60 bg-copper-soft/15'
          : 'border-border',
      )}
    >
      {/* Header */}
      <header className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn('h-2 w-2 rounded-full', STAGE_DOT[stage])}
          />
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-ink">
            {STAGE_LABEL[stage]}
          </h3>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-muted">
            {deals.length}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
          {formatUSD(total)}
        </p>
      </header>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {deals.length === 0 ? (
          <div
            className={cn(
              'flex min-h-24 items-center justify-center rounded-md border border-dashed px-3 py-6 text-center transition-colors',
              isOver ? 'border-copper/40' : 'border-border',
            )}
          >
            <p className="font-sans text-xs text-ink-subtle">
              {isOver ? 'Drop here' : 'No deals'}
            </p>
          </div>
        ) : (
          deals.map((deal) => <DealCard key={deal.id} deal={deal} />)
        )}
      </div>
    </section>
  );
}
