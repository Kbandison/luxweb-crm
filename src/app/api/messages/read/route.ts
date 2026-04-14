import { z } from 'zod';
import { getSession } from '@/lib/supabase/session';
import { markThreadRead, threadBelongsToUser } from '@/lib/queries/messages';

export const runtime = 'nodejs';

const Schema = z.object({ thread_id: z.string().uuid() });

/** PATCH /api/messages/read — mark all incoming messages in a thread as read. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (session.role === 'client') {
    const ok = await threadBelongsToUser(parsed.data.thread_id, session.userId);
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
  }

  await markThreadRead(parsed.data.thread_id, session.userId);
  return Response.json({ ok: true });
}
