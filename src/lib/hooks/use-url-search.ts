'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-synced search input state for admin list pages.
 *
 * The URL is the source of truth for `?q=...` so pagination, sort, and
 * shareable links all keep the filter intact. The hook still tracks a
 * local string so typing stays snappy — it commits to the URL after a
 * short debounce (default 250ms). Each commit also drops `?page=` so the
 * user lands back on page 1 of the new query instead of page 5 of nothing.
 *
 * Other URL params (`sort`, `dir`, `ids`, `lead`, etc.) are preserved.
 */
export function useUrlSearchInput(options?: { debounceMs?: number }): {
  q: string;
  setQ: (next: string) => void;
} {
  const debounceMs = options?.debounceMs ?? 250;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL value — the source of truth.
  const urlQ = searchParams.get('q') ?? '';

  // Local typing state — initialised from the URL.
  const [q, setQLocal] = useState<string>(urlQ);

  // If the URL changes from elsewhere (back/forward, link click), sync local
  // state — but only when we aren't mid-typing (no pending debounce).
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingRef.current == null && urlQ !== q) {
      setQLocal(urlQ);
    }
    // We deliberately don't depend on `q` here — we only want this to fire
    // when the URL changes from the outside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      const sp = new URLSearchParams(searchParams.toString());
      if (trimmed) sp.set('q', trimmed);
      else sp.delete('q');
      // Typing a new query resets pagination — otherwise the user could be
      // stranded on page 5 of a filtered set with no matching results.
      sp.delete('page');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setQ = useCallback(
    (next: string) => {
      setQLocal(next);
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        commit(next);
      }, debounceMs);
    },
    [commit, debounceMs],
  );

  // Clean up any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, []);

  return { q, setQ };
}
