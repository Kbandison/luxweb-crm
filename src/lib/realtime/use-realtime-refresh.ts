'use client';
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseBrowser } from '@/lib/supabase/browser';

type SubscriptionStatus =
  | 'CLOSED'
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'JOINING';

type Options = {
  /**
   * Stable identifier for the channel. Used as the channel name passed to
   * `supabase.channel(channelKey)`. Changing this string causes the channel
   * to tear down and rebuild — keep it stable across re-renders unless you
   * intend to resubscribe.
   */
  channelKey: string;
  /**
   * Wires up `.on(...)` listeners on the freshly-created channel. The hook
   * calls `.subscribe()` itself — DO NOT call `.subscribe()` in this
   * callback. Must return the channel (typically the chained result of
   * `.on(...)`).
   */
  subscribe: (channel: RealtimeChannel) => RealtimeChannel;
  /**
   * Invoked on each event delivered to the channel AND on each fallback
   * tick when the channel isn't SUBSCRIBED. Caller is responsible for any
   * debouncing — the hook does not coalesce calls.
   */
  onEvent: () => void;
  /**
   * Fallback poll interval used when the subscription state is anything
   * other than 'SUBSCRIBED'. Defaults to 30_000ms.
   */
  fallbackMs?: number;
};

/**
 * Mounts a single Supabase Realtime channel, tracks its subscription
 * status, and pairs it with a visibility-aware polling fallback. The
 * fallback runs while the tab is visible AND the channel is not in the
 * SUBSCRIBED state — so this still works when Realtime publication isn't
 * enabled on the target table(s).
 *
 * Lifecycle:
 *  - On mount: subscribe to the channel, start the visibility watcher.
 *  - On tab visible: fire `onEvent()` once, start fallback timer if not
 *    SUBSCRIBED.
 *  - On tab hidden: stop fallback timer (Realtime auto-pauses too).
 *  - On unmount: removeChannel + clear timer + drop visibility listener.
 */
export function useRealtimeRefresh(opts: Options): {
  status: SubscriptionStatus;
} {
  const { channelKey, subscribe, onEvent, fallbackMs = 30_000 } = opts;
  const [status, setStatus] = useState<SubscriptionStatus>('CLOSED');

  // Keep the latest callbacks in refs so we can rebuild the channel only
  // when `channelKey` changes — not on every render.
  const subscribeRef = useRef(subscribe);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    subscribeRef.current = subscribe;
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseBrowser();
    let channel: RealtimeChannel | null = null;
    let interval: number | null = null;
    let currentStatus: SubscriptionStatus = 'CLOSED';

    function startFallback() {
      if (interval != null) return;
      if (currentStatus === 'SUBSCRIBED') return;
      if (document.visibilityState !== 'visible') return;
      interval = window.setInterval(() => {
        onEventRef.current();
      }, fallbackMs);
    }
    function stopFallback() {
      if (interval == null) return;
      window.clearInterval(interval);
      interval = null;
    }

    function applyStatus(next: SubscriptionStatus) {
      currentStatus = next;
      if (cancelled) return;
      setStatus(next);
      // When SUBSCRIBED, kill the fallback. When anything else and the tab
      // is visible, run it.
      if (next === 'SUBSCRIBED') {
        stopFallback();
      } else {
        startFallback();
      }
    }

    const base = supabase.channel(channelKey);
    const configured = subscribeRef.current(base);
    channel = configured.subscribe((s) => {
      // The subscribe callback gives us channel state transitions. Map
      // anything we don't explicitly recognise to CLOSED so the fallback
      // kicks in.
      const next: SubscriptionStatus =
        s === 'SUBSCRIBED' ||
        s === 'CHANNEL_ERROR' ||
        s === 'TIMED_OUT' ||
        s === 'CLOSED' ||
        s === 'JOINING'
          ? s
          : 'CLOSED';
      applyStatus(next);
    });

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        // Fire a refresh on becoming visible so we catch anything missed
        // while hidden, then resume fallback if we aren't subscribed.
        onEventRef.current();
        startFallback();
      } else {
        stopFallback();
      }
    }

    if (document.visibilityState === 'visible') startFallback();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stopFallback();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelKey, fallbackMs]);

  return { status };
}
