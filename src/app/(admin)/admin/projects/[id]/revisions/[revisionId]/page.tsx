import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRevision } from '@/lib/queries/admin';
import { RevisionThread } from '@/components/revisions/revision-thread';

export default async function AdminRevisionDetailPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId } = await params;
  const detail = await getRevision(revisionId);
  if (!detail || detail.revision.projectId !== id) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-8 py-8">
      <Link
        href={`/admin/projects/${id}/revisions`}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted hover:text-copper"
      >
        ← All revisions
      </Link>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
        {detail.revision.contactName}
      </p>
      <RevisionThread
        revision={{
          id: detail.revision.id,
          title: detail.revision.title,
          body: detail.revision.body,
          status: detail.revision.status,
          milestoneTitle: detail.revision.milestoneTitle,
          createdAt: detail.revision.createdAt,
          resolvedAt: detail.revision.resolvedAt,
        }}
        comments={detail.comments}
        viewerRole="admin"
      />
    </main>
  );
}
