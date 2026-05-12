'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRealtimeRefresh } from '@/lib/realtime/use-realtime-refresh';

const DEFAULT_TABLES = [
  'milestones',
  'invoices',
  'revision_requests',
  'contracts',
  'proposals',
  'project_credentials',
  'care_plan_subscriptions',
] as const;

type Props = {
  projectId: string;
  /**
   * Override the default table list. Each entry is a `crm` schema table
   * that has a `project_id` column. The refresher subscribes to all
   * changes (INSERT/UPDATE/DELETE) on each table for the given project.
   */
  tables?: readonly string[];
};

/**
 * Side-effect component that mounts inside a project workspace layout
 * and pushes router.refresh() on any change to a watched table for the
 * current project. Bursty mutations (e.g. milestone seed inserts 5+
 * rows in quick succession) are coalesced into a single refresh via
 * 500ms debounce.
 *
 * Pauses while the tab is hidden, resumes on visibilitychange. Falls
 * back to polling (30s) when Realtime isn't SUBSCRIBED.
 *
 * Renders nothing.
 */
export function ProjectRefresher({
  projectId,
  tables = DEFAULT_TABLES,
}: Props) {
  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  // Debounced router.refresh(). Milestone seed and other bulk inserts
  // would otherwise trigger N refreshes back-to-back. 500ms is long
  // enough to coalesce a burst, short enough that the UI still feels
  // instant.
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

  // Stable list-of-tables key so the hook only rebuilds the channel
  // when the actual table set changes — not on every parent re-render
  // that happens to pass a freshly-constructed array.
  const tableKey = tables.join(',');

  const subscribe = useCallback(
    (channel: RealtimeChannel) => {
      let ch = channel;
      for (const table of tables) {
        ch = ch.on(
          // The supabase-js types are tight on the first arg; the
          // runtime accepts the string literal we pass here.
          'postgres_changes' as never,
          {
            event: '*',
            schema: 'crm',
            table,
            filter: `project_id=eq.${projectId}`,
          } as never,
          () => {
            trigger();
          },
        );
      }
      return ch;
    },
    // tableKey covers the `tables` content; `projectId` and `trigger`
    // are the other real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, tableKey, trigger],
  );

  useRealtimeRefresh({
    channelKey: `project:${projectId}`,
    subscribe,
    onEvent: trigger,
    fallbackMs: 30_000,
  });

  return null;
}
