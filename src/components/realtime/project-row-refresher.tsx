'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRealtimeRefresh } from '@/lib/realtime/use-realtime-refresh';

type Props = {
  projectId: string;
};

/**
 * Side-effect component that watches the SINGLE row in `crm.projects`
 * matching the given id. Used alongside `<ProjectRefresher />` to pick
 * up status flips on the project itself (which aren't covered by the
 * project_id-filtered subscriptions in the sibling component).
 *
 * Pauses while hidden, falls back to 30s polling when not SUBSCRIBED.
 * Same 500ms debounce so concurrent updates coalesce. Renders nothing.
 */
export function ProjectRowRefresher({ projectId }: Props) {
  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  const trigger = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      router.refresh();
    }, 500);
  }, [router]);

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const subscribe = useCallback(
    (channel: RealtimeChannel) =>
      channel.on(
        'postgres_changes' as never,
        {
          event: 'UPDATE',
          schema: 'crm',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        } as never,
        () => {
          trigger();
        },
      ),
    [projectId, trigger],
  );

  useRealtimeRefresh({
    channelKey: `project-row:${projectId}`,
    subscribe,
    onEvent: trigger,
    fallbackMs: 30_000,
  });

  return null;
}
