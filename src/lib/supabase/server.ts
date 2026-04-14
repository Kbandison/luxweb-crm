import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Next 16: cookies() is async. The server client reads auth cookies on
// every request and writes refreshed cookies back through the adapter.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `set` throws in pure RSC contexts (read-only cookies).
            // That's expected — proxy.ts refreshes the session cookie on
            // every navigation, so missing a write here is not a problem.
          }
        },
      },
    },
  );
}
