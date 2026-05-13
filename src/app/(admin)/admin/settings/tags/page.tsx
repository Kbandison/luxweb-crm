import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TagsManager } from '@/components/admin/settings/tags-manager';
import { getAllTags } from '@/lib/queries/admin';

export default async function AdminTagsSettingsPage() {
  const tags = await getAllTags();

  return (
    <>
      <Topbar />

      <main className="mx-auto w-full max-w-3xl space-y-10 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Settings"
          title="Tags"
          description="Tags are free-text labels on contacts. Rename or delete them here — changes apply across every contact that carries the tag."
        />

        {tags.length === 0 ? (
          <EmptyState
            title="No tags yet"
            description="Add tags from the client or lead detail drawers — they show up here."
          />
        ) : (
          <TagsManager tags={tags} />
        )}
      </main>
    </>
  );
}
