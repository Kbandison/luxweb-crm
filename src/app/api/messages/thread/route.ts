import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ensureProjectThread,
  getThreadMessages,
} from '@/lib/queries/messages';
import { flattenJoin } from '@/lib/array-join';

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
  // Contractor messaging is assignment-scoped and lands with the staff portal
  // (Pass 2); fail closed until then.
  if (session.role === 'contractor') {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) {
    return Response.json({ error: 'Missing project_id' }, { status: 400 });
  }

  // Verify ownership BEFORE materializing a thread row. Otherwise polling
  // a random project_id creates phantom threads. Admin needs the project
  // to exist; client needs to own it via contact.
  const { data: project } = await supabaseAdmin()
    .from('projects')
    .select('id, contact_id, contacts!inner(user_id)')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  if (session.role === 'client') {
    type Row = {
      contacts:
        | { user_id: string | null }
        | { user_id: string | null }[]
        | null;
    };
    const r = project as unknown as Row;
    const contact = flattenJoin(r.contacts);
    if (contact?.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const thread = await ensureProjectThread(projectId);
  if (!thread) {
    return Response.json({ messages: [] });
  }

  const messages = await getThreadMessages(thread.id);
  return Response.json({ thread, messages });
}
