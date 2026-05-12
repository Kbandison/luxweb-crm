'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRealtimeRefresh } from '@/lib/realtime/use-realtime-refresh';

const TABLES = [
  'invoices',
  'proposals',
  'contracts',
  'revision_requests',
] as const;

/**
 * Mounted on the admin dashboard. Subscribes to all changes on a small
 * set of high-signal tables across ALL rows (no filter — admin sees
 * everything). On any change, debounces and calls router.refresh() so
 * the dashboard's metric tiles + activity feed stay live.
 *
 * Falls back to 30s polling when Realtime isn't SUBSCRIBED.
 */
export function AdminDashboardRefresher() {
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
    channelKey: 'admin-dashboard',
    subscribe,
    onEvent: trigger,
    fallbackMs: 30_000,
  });

  return null;
}
