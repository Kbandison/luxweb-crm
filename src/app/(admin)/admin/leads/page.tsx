import { Topbar } from '@/components/admin/topbar';
import {
  getContactDetail,
  getContactProposals,
  getLeads,
} from '@/lib/queries/admin';
import { LeadsList } from '@/components/admin/leads/leads-list';
import {
  LeadDetail,
  LeadDetailEmpty,
} from '@/components/admin/leads/lead-detail';
import { NewLeadDrawer } from '@/components/admin/leads/new-lead-drawer';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead: leadId } = await searchParams;
  const [contacts, selected] = await Promise.all([
    getLeads(),
    leadId ? getContactDetail(leadId) : Promise.resolve(null),
  ]);
  const proposals = selected ? await getContactProposals(selected.id) : [];

  return (
    <>
      <Topbar title="Leads" />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
              <span>Admin</span>
              <span className="text-copper">/</span>
              <span className="text-ink">Leads</span>
            </nav>
            <span aria-hidden className="h-3 w-px bg-border" />
            <p className="font-mono text-[10px] tabular-nums uppercase tracking-[0.18em] text-ink-muted">
              {contacts.length} total
            </p>
          </div>
          <NewLeadDrawer />
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
          <div
            className={`${selected ? 'hidden lg:block' : ''} min-h-0 border-r border-border bg-surface`}
          >
            <LeadsList initial={contacts} selectedId={selected?.id ?? null} />
          </div>

          <div
            className={`${selected ? '' : 'hidden lg:block'} min-h-0 bg-bg`}
          >
            {selected ? (
              <LeadDetail lead={selected} proposals={proposals} />
            ) : (
              <LeadDetailEmpty />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
