import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { connectFromCode } from '@/lib/google/calendar';

export const runtime = 'nodejs';

/**
 * GET /api/admin/google/callback — Google redirects here with ?code. Owner-
 * only; exchanges the code and stores the (encrypted) tokens for this session,
 * then returns to the outreach page.
 */
export async function GET(req: NextRequest) {
  const done = (status: string) =>
    NextResponse.redirect(new URL(`/admin/outreach?google=${status}`, req.url));
  try {
    const session = await requireAdmin();
    const code = req.nextUrl.searchParams.get('code');
    const err = req.nextUrl.searchParams.get('error');
    if (err || !code) return done('denied');

    await connectFromCode(session.userId, code, req.nextUrl.origin);
    return done('connected');
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[google/callback]', e);
    return done('error');
  }
}
