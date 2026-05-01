import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientRevision } from '@/lib/queries/client';
import { RevisionThread } from '@/components/revisions/revision-thread';

export default async function ClientRevisionDetailPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  const detail = await getClientRevision(revisionId, session.userId);
  if (!detail || detail.projectId !== id) notFound();

  return (
    <main className="space-y-4 px-6 py-10 md:px-10">
      <Link
        href={`/portal/project/${id}/revisions`}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
      >
        ← All revisions
      </Link>
      <RevisionThread
        revision={{
          id: detail.id,
          title: detail.title,
          body: detail.body,
          status: detail.status,
          milestoneTitle: detail.milestoneTitle,
          createdAt: detail.createdAt,
          resolvedAt: detail.resolvedAt,
        }}
        comments={detail.comments}
        viewerRole="client"
      />
    </main>
  );
}
