import { getProjectFiles } from '@/lib/queries/admin';
import { FilesList } from '@/components/admin/projects/files-list';

export default async function ProjectFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const files = await getProjectFiles(id);

  // Workspace tab max-w rule:
  //   - Content-heavy tabs (overview, proposals, contracts, revisions,
  //     credentials, agreement) clamp to `max-w-5xl` for legibility.
  //   - Tool tabs (files, milestones, time, messages, invoices) take the
  //     full available width — they're tables/grids that benefit from room.
  return (
    <main className="w-full px-8 py-8">
      <FilesList projectId={id} initial={files} />
    </main>
  );
}
