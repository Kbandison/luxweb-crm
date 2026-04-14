import { Topbar } from '@/components/admin/topbar';
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
        {/* Header */}
        <header className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-6 copper-mesh">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-copper/20 via-gold/10 to-transparent blur-2xl"
          />
          <div className="relative">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-copper">
              Admin · Audit log
            </p>
            <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink md:text-4xl">
              Every mutation, recorded.
            </h1>
            <p className="mt-2 max-w-xl font-sans text-sm text-ink-muted">
              Every create, update, delete, and signed acceptance across the
              CRM. Click a row to see the full diff — including technical
              metadata like IP + user agent that never appears on client-facing
              surfaces.
            </p>
          </div>
        </header>

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
