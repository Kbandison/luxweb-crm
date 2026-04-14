'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Monogram } from '@/components/admin/leads/monogram';
import { cn } from '@/lib/utils';
import type { DealCard as DealCardType } from '@/lib/queries/admin';
import { formatUSD } from '@/lib/formatters';

export function DealCard({ deal }: { deal: DealCardType }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const stageAge = relativeStageAge(deal.stageChangedAt);

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...attributes}
      {...listeners}
      className={cn(
        'group cursor-grab touch-none select-none rounded-lg border bg-surface px-3 py-2.5 transition-all',
        'border-border hover:border-border-strong hover:shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)]',
        'active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      {/* Top row: value + days-in-stage */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-base font-medium tabular-nums tracking-tight text-ink">
          {formatUSD(deal.valueCents)}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
          {stageAge}
        </span>
      </div>

      {/* Title */}
      <p className="mt-1.5 line-clamp-2 font-sans text-sm font-medium text-ink">
        {deal.title}
      </p>

      {/* Probability bar (only if > 0) */}
      {deal.probability > 0 ? (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-copper/70"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            {deal.probability}%
          </span>
        </div>
      ) : null}

      {/* Contact */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        <Monogram name={deal.contactName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-xs font-medium text-ink">
            {deal.contactName}
          </p>
          {deal.contactCompany ? (
            <p className="truncate font-sans text-[11px] text-ink-muted">
              {deal.contactCompany}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function relativeStageAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return minutes < 1 ? 'just now' : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}
