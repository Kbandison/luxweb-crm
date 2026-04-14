import { z } from 'zod';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const Schema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
});

/**
 * POST /api/notifications/mark-read
 * Marks notifications as read. Either ids[] or { all: true }.
 * Always scoped to the caller's own user_id — can't mark someone else's.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const base = supabaseAdmin()
    .from('notifications')
    .update({ read_at: now })
    .eq('user_id', session.userId)
    .is('read_at', null);

  if (parsed.data.all) {
    await base;
  } else if (parsed.data.ids && parsed.data.ids.length > 0) {
    await base.in('id', parsed.data.ids);
  } else {
    return Response.json({ error: 'Pass ids[] or { all: true }' }, { status: 400 });
  }

  return Response.json({ ok: true });
}
