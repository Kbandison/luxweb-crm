import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import {
  ensureProjectThread,
  getThreadMessages,
} from '@/lib/queries/messages';
import { MessagesThread } from '@/components/messages/messages-thread';

export default async function AdminProjectMessagesPage({
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
    <main className="px-6 py-8 md:px-10">
      <MessagesThread
        projectId={id}
        threadId={thread.id}
        viewerId={session.userId}
        viewerRole="admin"
        initialMessages={messages}
      />
    </main>
  );
}
