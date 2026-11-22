import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { getAuthUrl, googleConfigured, OAUTH_STATE_COOKIE } from '@/lib/google/oauth';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

/**
 * GET /api/admin/google/connect — owner-only. Redirects to Google's consent
 * screen for calendar access and Gmail sending. The callback stores tokens
 * for this session.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    if (!googleConfigured()) {
      return NextResponse.redirect(
        new URL('/admin/outreach?google=unconfigured', req.url),
      );
    }
    const origin = req.nextUrl.origin;
    const state = randomBytes(12).toString('hex');
    const res = NextResponse.redirect(getAuthUrl(origin, state));
    // The callback only accepts a code that comes back with this state, so a
    // link can't connect someone else's Google account (which would then
    // send outreach email).
    res.cookies.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/admin/google',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
