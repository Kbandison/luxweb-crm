import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { getAuditLog } from '@/lib/queries/audit';
import { AuditFilters } from '@/components/admin/audit/audit-filters';
import { AuditTable } from '@/components/admin/audit/audit-table';
import { AuditPagination } from '@/components/admin/audit/audit-pagination';

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity_type?: string;
    action?: string;
    actor_email?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const result = await getAuditLog({
    entityType: sp.entity_type,
    action: sp.action,
    actorEmail: sp.actor_email,
    from: sp.from,
    to: sp.to,
    page,
    pageSize: 50,
  });

  return (
    <>
      <Topbar title="Audit log" />

      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-8 md:px-10">
        <PageHeader
          eyebrow="Workspace"
          title="Audit log"
          description="Every create, update, delete, and signed acceptance across the CRM. Click a row to see the full diff — including technical metadata like IP + user agent that never appears on client-facing surfaces."
        />

        <AuditFilters />

        <AuditTable entries={result.entries} />

        <AuditPagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </main>
    </>
  );
}
