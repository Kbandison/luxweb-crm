import { z } from 'zod';
import { getSession } from '@/lib/supabase/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ensureProjectThread, threadBelongsToUser } from '@/lib/queries/messages';
import { notify, getAdminUserId, getContactUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

const Schema = z.object({
  project_id: z.string().uuid(),
  body: z.string().min(1).max(8000),
});

/**
 * POST /api/messages/send
 * Both admin and client send through here. Ownership guards on the
 * project — client must own it via contacts.user_id; admin can post
 * anywhere.
 */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return Response.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const thread = await ensureProjectThread(parsed.data.project_id);
    if (!thread) {
      return Response.json({ error: 'Could not open thread' }, { status: 500 });
    }

    if (session.role === 'client') {
      const ok = await threadBelongsToUser(thread.id, session.userId);
      if (!ok) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const { data, error } = await supabaseAdmin()
      .from('messages')
      .insert({
        thread_id: thread.id,
        sender_id: session.userId,
        body: parsed.data.body,
      })
      .select('id, created_at')
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Send failed' },
        { status: 500 },
      );
    }

    // Notify the other side.
    const snippet =
      parsed.data.body.length > 120
        ? parsed.data.body.slice(0, 117) + '…'
        : parsed.data.body;

    if (session.role === 'admin') {
      // Admin → find the client user for this project's contact
      const { data: proj } = await supabaseAdmin()
        .from('projects')
        .select('contact_id')
        .eq('id', parsed.data.project_id)
        .single();
      const contactId = proj?.contact_id as string | undefined;
      if (contactId) {
        const clientUserId = await getContactUserId(contactId);
        if (clientUserId && clientUserId !== session.userId) {
          await notify({
            type: 'message' as unknown as 'milestone_updated',
            userId: clientUserId,
            // Reusing payload shape loosely — the bell handler reads by type
            // and looks up raw fields, so this is safe.
            ...({
              snippet,
              projectId: parsed.data.project_id,
              threadId: thread.id,
              senderName: 'LuxWeb Studio',
            } as unknown as object),
          } as unknown as Parameters<typeof notify>[0]);
        }
      }
    } else {
      // Client → notify the admin
      const adminId = await getAdminUserId();
      if (adminId && adminId !== session.userId) {
        await notify({
          type: 'message' as unknown as 'milestone_updated',
          userId: adminId,
          ...({
            snippet,
            projectId: parsed.data.project_id,
            threadId: thread.id,
            senderName: session.email,
          } as unknown as object),
        } as unknown as Parameters<typeof notify>[0]);
      }
    }

    return Response.json({
      ok: true,
      message: { id: data.id, created_at: data.created_at },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
