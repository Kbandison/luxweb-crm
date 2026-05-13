import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { getAllContracts } from '@/lib/queries/admin';
import { formatDate } from '@/lib/formatters';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_TONE,
  type ContractStatus,
} from '@/lib/status-meta';

export default async function AdminContractsListPage() {
  const contracts = await getAllContracts();

  return (
    <>
      <Topbar />

      <main className="mx-auto w-full max-w-6xl space-y-10 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Workspace"
          title="Contracts"
          description="Every contract generated from an accepted proposal. Open one to see the rendered agreement, signatures, and void controls."
        />

        {contracts.length === 0 ? (
          <EmptyState
            title="No contracts yet"
            description="Contracts auto-generate when a proposal is accepted. Counter-sign from the proposal page to create the agreement."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-border bg-surface text-left">
                <tr className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 font-medium">Proposal</th>
                  <th className="px-3 py-3 font-medium">Version</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Signed</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const href = c.projectId
                    ? `/admin/projects/${c.projectId}/contracts/${c.id}`
                    : `/admin/contracts/${c.id}`;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border bg-surface transition-colors last:border-b-0 hover:bg-copper-soft/15"
                    >
                      <td className="px-5 py-3 font-sans text-sm">
                        <Link href={href} className="text-ink hover:text-copper">
                          <span className="font-medium">{c.contactName}</span>
                          {c.contactCompany ? (
                            <span className="ml-1 text-xs text-ink-muted">
                              · {c.contactCompany}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-sans text-sm text-ink-muted">
                        <Link href={href} className="hover:text-copper">
                          {c.proposalTitle ?? '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                        {c.agreementVersion}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          label={
                            CONTRACT_STATUS_LABEL[c.status as ContractStatus] ??
                            c.status
                          }
                          tone={
                            CONTRACT_STATUS_TONE[c.status as ContractStatus] ??
                            'bg-ink/5 text-ink-muted'
                          }
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-muted">
                        {c.signedAt ? formatDate(c.signedAt) : '—'}
                      </td>
                      <td className="px-3 py-3 pr-6 font-mono text-xs tabular-nums text-ink-subtle">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
