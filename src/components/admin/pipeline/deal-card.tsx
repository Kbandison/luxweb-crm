'use client';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Monogram } from '@/components/admin/leads/monogram';
import { cn } from '@/lib/utils';
import type { DealCard as DealCardType } from '@/lib/queries/admin';
import { formatUSD } from '@/lib/formatters';
import { EditDealDrawer } from './edit-deal-drawer';

export function DealCard({ deal }: { deal: DealCardType }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const [editing, setEditing] = useState(false);

  const stageAge = relativeStageAge(deal.stageChangedAt);

  // The drawer is a sibling of the draggable <article>, not a child: React
  // events bubble through the component tree even out of portals, so any
  // keydown/pointerdown inside a nested drawer reached dnd-kit's listeners.
  // Plain <div> wrapper (not a fragment) so the open overlay doesn't pick up
  // the column's space-y margin.
  return (
    <div>
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
        {/* Top row: value + days-in-stage + edit */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-base font-medium tabular-nums tracking-tight text-ink">
            {formatUSD(deal.valueCents)}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
              {stageAge}
            </span>
            {/* Stops pointerdown (drag) and keydown (KeyboardSensor grabs
                Space/Enter) so the pencil opens the editor, not a drag. */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={() => setEditing(true)}
              aria-label="Edit deal"
              title="Edit deal"
              className="shrink-0 rounded-md p-1 text-ink-subtle/70 transition-colors hover:bg-surface-2 hover:text-copper"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
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
      <EditDealDrawer
        deal={deal}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
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
