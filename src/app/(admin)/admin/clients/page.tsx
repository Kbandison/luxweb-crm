import { Topbar } from '@/components/admin/topbar';
import { getClientsList } from '@/lib/queries/admin';
import { ClientsTable } from '@/components/admin/clients/clients-table';

export default async function ClientsPage() {
  const clients = await getClientsList();

  return (
    <>
      <Topbar title="Clients" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Clients</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-[0.18em] text-ink-muted">
              {clients.length} total
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-bg">
          <ClientsTable initial={clients} />
        </div>
      </div>
    </>
  );
}
