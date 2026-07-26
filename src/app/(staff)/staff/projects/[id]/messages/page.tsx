import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  ensureProjectThread,
  getThreadMessages,
} from '@/lib/queries/messages';
import { MessagesThread } from '@/components/messages/messages-thread';

// Access is gated by the project layout (requireAssignedProjectPage). The
// contractor participates in the project's studio↔client thread as the studio
// side, so viewerRole="admin" here means "studio side", not the owner role.
export default async function StaffProjectMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const thread = await ensureProjectThread(id);
  if (!thread) notFound();
  const messages = await getThreadMessages(thread.id);

  return (
    <MessagesThread
      projectId={id}
      threadId={thread.id}
      viewerId={session.userId}
      viewerRole="admin"
      initialMessages={messages}
    />
  );
}
