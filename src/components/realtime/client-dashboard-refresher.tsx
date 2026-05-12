'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRealtimeRefresh } from '@/lib/realtime/use-realtime-refresh';

const TABLES = ['projects', 'invoices'] as const;

/**
 * Mounted on the client portal dashboard. Ownership-filtering on these
 * tables would require a user_id column we don't have, so we subscribe
 * broadly and rely on the server-side query during refetch to enforce
 * the viewer's ownership — Realtime is only a refresh trigger here, no
 * payload data is consumed.
 *
 * Falls back to 30s polling when Realtime isn't SUBSCRIBED.
 */
export function ClientDashboardRefresher() {
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
    (channel: RealtimeChannel) => {
      let ch = channel;
      for (const table of TABLES) {
        ch = ch.on(
          'postgres_changes' as never,
          {
            event: '*',
            schema: 'crm',
            table,
          } as never,
          () => {
            trigger();
          },
        );
      }
      return ch;
    },
    [trigger],
  );

  useRealtimeRefresh({
    channelKey: 'client-dashboard',
    subscribe,
    onEvent: trigger,
    fallbackMs: 30_000,
  });

  return null;
}
