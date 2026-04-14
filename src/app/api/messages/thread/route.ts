import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/supabase/session';
import {
  ensureProjectThread,
  getThreadMessages,
  threadBelongsToUser,
} from '@/lib/queries/messages';

export const runtime = 'nodejs';

/**
 * GET /api/messages/thread?project_id=...
 * Returns the thread + messages for this project. Used by the messages
 * component for polling refresh.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) {
    return Response.json({ error: 'Missing project_id' }, { status: 400 });
  }

  const thread = await ensureProjectThread(projectId);
  if (!thread) {
    return Response.json({ messages: [] });
  }

  if (session.role === 'client') {
    const ok = await threadBelongsToUser(thread.id, session.userId);
    if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const messages = await getThreadMessages(thread.id);
  return Response.json({ thread, messages });
}
