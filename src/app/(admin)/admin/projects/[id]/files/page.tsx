import { getProjectFiles } from '@/lib/queries/admin';
import { FilesList } from '@/components/admin/projects/files-list';

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const files = await getProjectFiles(id);

  return (
    <main className="mx-auto w-full max-w-5xl px-8 py-8">
      <FilesList projectId={id} initial={files} />
    </main>
  );
}
