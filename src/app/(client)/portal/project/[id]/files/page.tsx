import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/supabase/session';
import { getClientProjectFiles } from '@/lib/queries/client';
import { ClientFilesList } from '@/components/client/files-list';
import { SectionHead } from '@/components/ui/section-head';

export default async function ClientProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');
  const files = await getClientProjectFiles(id, session.userId);
  if (files === null) notFound();

  return (
    <main className="space-y-6 px-6 py-10 md:px-10">
      <SectionHead title="Files" />
      <ClientFilesList projectId={id} initial={files} />
    </main>
  );
}
