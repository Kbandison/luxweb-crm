'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DealCard as DealCardType, PipelineStage } from '@/lib/queries/admin';
import { StageColumn } from './stage-column';
import { DealCard } from './deal-card';
import { STAGES } from './stage-meta';

export function KanbanBoard({ initialDeals }: { initialDeals: DealCardType[] }) {
  const [deals, setDeals] = useState<DealCardType[]>(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inFlightRef = useRef(0);

  // Sync server-fetched deals into local state whenever the page re-renders
  // (e.g. after router.refresh() from the New Deal drawer). Skip the sync
  // while a drag is active or a stage PATCH is in flight — otherwise an
  // optimistic drag could be overwritten by a stale server view.
  useEffect(() => {
    if (activeId !== null) return;
    if (inFlightRef.current > 0) return;
    setDeals(initialDeals);
  }, [initialDeals, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  // Stable ID for dnd-kit's internal a11y announcement IDs. Without this,
  // dnd-kit's auto-counter differs between SSR and client → hydration mismatch.
  const dndId = useId();

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const dealId = String(active.id);
    const newStage = String(over.id) as PipelineStage;
    if (!STAGES.includes(newStage)) return;

    const current = deals.find((d) => d.id === dealId);
    if (!current || current.stage === newStage) return;

    // Optimistic update
    const previousStage = current.stage;
    setDeals((curr) =>
      curr.map((d) => (d.id === dealId ? { ...d, stage: newStage, stageChangedAt: new Date().toISOString() } : d)),
    );

    inFlightRef.current += 1;
    try {
      const res = await fetch(`/api/admin/deals/${dealId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error('rollback');
      const json = await res.json();
      // Sync the trigger-set timestamp back from the server.
      if (json.stage_changed_at) {
        setDeals((curr) =>
          curr.map((d) =>
            d.id === dealId ? { ...d, stageChangedAt: json.stage_changed_at } : d,
          ),
        );
      }
    } catch {
      // Rollback
      setDeals((curr) =>
        curr.map((d) =>
          d.id === dealId
            ? { ...d, stage: previousStage, stageChangedAt: current.stageChangedAt }
            : d,
        ),
      );
    } finally {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
    }
  }

  const dragging = activeId ? deals.find((d) => d.id === activeId) : null;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full gap-4 overflow-x-auto px-6 py-6">
        {STAGES.map((stage) => (
          <StageColumn
            key={stage}
            stage={stage}
            deals={deals.filter((d) => d.stage === stage)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="rotate-1 shadow-[0_24px_48px_-16px_rgba(180,83,9,0.35)]">
            <DealCard deal={dragging} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
