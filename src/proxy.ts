import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Next 16: `middleware.ts` → `proxy.ts`. Runtime is nodejs (required —
// the service-role admin client won't run on edge).
//
// Three layers of defense per crm_routes.md: this is layer 1 (route gate).
// Layer 2 = `requireAdmin` / `requireClient` / `requireProjectAccess` in
// server routes. Layer 3 = `lib/queries/client.ts` with visibility-safe
// SELECTs. A bug in any one layer is caught by the next.

const AUTH_PATHS = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail-open if env is missing locally — the server guards still enforce.
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser —
  // the cookie-refresh roundtrip needs to happen first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.has(pathname);
  const isAdminPath =
    pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const isClientPath =
    pathname.startsWith('/portal') || pathname.startsWith('/api/client');

  // Unauthenticated
  if (!user) {
    if (isAdminPath || isClientPath) {
      const dest = new URL('/login', request.url);
      dest.searchParams.set('next', pathname);
      return NextResponse.redirect(dest);
    }
    return response;
  }

  // Authenticated — resolve role from crm.users.
  let role: 'admin' | 'client' | null = null;
  try {
    const { data } = await supabaseAdmin()
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    role = (data?.role as 'admin' | 'client' | undefined) ?? null;
  } catch {
    role = null;
  }

  // Orphan auth user (no crm.users row). Sign them to /login with an
  // error marker so they can see something useful instead of looping.
  if (!role) {
    const dest = new URL('/login', request.url);
    dest.searchParams.set('error', 'no_role');
    // Best-effort sign-out so the cookie isn't stale on retry.
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop */
    }
    return NextResponse.redirect(dest);
  }

  // Bounce signed-in users away from auth pages.
  if (isAuthPath) {
    const dest = role === 'admin' ? '/admin/dashboard' : '/portal/dashboard';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Role mismatch — push to the user's own dashboard (404-on-scoping is
  // the job of the server guards; this gate is coarse-grained).
  if (isAdminPath && role !== 'admin') {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url));
  }
  if (isClientPath && role !== 'client') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  return response;
}

export const config = {
  // Proxy runs on navigations + API routes, EXCEPT:
  // - Next internals (_next/static, _next/image)
  // - favicon
  // - webhooks (they verify their own signatures — Stripe, Resend)
  // - /api/public (explicitly unauthenticated — marketing-site lead capture etc.)
  // - /auth/callback (session being established; proxy can't gate yet)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/public|auth/callback).*)',
  ],
};
