import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProject } from '@/lib/queries/client';
import {
  ensureProjectThread,
  getThreadMessages,
} from '@/lib/queries/messages';
import { MessagesThread } from '@/components/messages/messages-thread';

export default async function ClientProjectMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  // Ownership check — reuse the visibility-safe client query.
  const project = await getClientProject(id, session.userId);
  if (!project) notFound();

  const thread = await ensureProjectThread(id);
  if (!thread) notFound();
  const messages = await getThreadMessages(thread.id);

  return (
    <main className="px-6 py-8 md:px-10">
      <MessagesThread
        projectId={id}
        threadId={thread.id}
        viewerId={session.userId}
        viewerRole="client"
        initialMessages={messages}
      />
    </main>
  );
}
