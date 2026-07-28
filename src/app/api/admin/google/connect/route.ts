import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { getAuthUrl, googleConfigured } from '@/lib/google/calendar';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

/**
 * GET /api/admin/google/connect — owner-only. Redirects to Google's consent
 * screen for Calendar access. The callback stores tokens for this session.
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
    return NextResponse.redirect(getAuthUrl(origin, state));
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
