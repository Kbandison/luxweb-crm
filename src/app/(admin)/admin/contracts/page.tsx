import Link from 'next/link';
import { Topbar } from '@/components/admin/topbar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { getAllAgreements } from '@/lib/queries/admin';
import { formatDate, formatUSD } from '@/lib/formatters';
import {
  AGREEMENT_STAGE_META,
  type AgreementGroup,
} from '@/lib/agreements/stage';
import { cn } from '@/lib/utils';

const VIEWS: { key: AgreementGroup | 'all'; label: string }[] = [
  { key: 'active', label: 'In progress' },
  { key: 'signed', label: 'Signed' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

/**
 * Every agreement, drafts through signed. The route keeps its /contracts
 * path so existing links still work; what it lists is agreements — the draft
 * and the contract generated from it, as one row.
 */
export default async function AdminAgreementsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const requested = typeof sp.view === 'string' ? sp.view : 'active';
  const view = VIEWS.some((v) => v.key === requested) ? requested : 'active';

  const all = await getAllAgreements();
  const counts = Object.fromEntries(
    VIEWS.map((v) => [
      v.key,
      v.key === 'all'
        ? all.length
        : all.filter((a) => AGREEMENT_STAGE_META[a.stage].group === v.key).length,
    ]),
  );
  const rows =
    view === 'all'
      ? all
      : all.filter((a) => AGREEMENT_STAGE_META[a.stage].group === view);

  return (
    <>
      <Topbar />

      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 pb-16 pt-10 md:px-10">
        <PageHeader
          eyebrow="Workspace"
          title="Agreements"
          description="Every agreement from draft to signed. Open one to edit the draft, or to see the signed contract, signatures, and void controls."
        />

        <nav aria-label="Filter agreements" className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === 'active' ? '/admin/contracts' : `/admin/contracts?view=${v.key}`}
              aria-current={view === v.key ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-meta transition-colors',
                view === v.key
                  ? 'border-copper/40 bg-copper-soft/50 text-copper'
                  : 'border-border bg-surface text-ink-muted hover:text-ink',
              )}
            >
              {v.label} · {counts[v.key]}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <EmptyState
            title={all.length === 0 ? 'No agreements yet' : 'Nothing here'}
            description={
              all.length === 0
                ? "Start one from a lead's or a project's page."
                : 'No agreements in this view.'
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-border bg-surface text-left">
                <tr className="font-mono text-[10px] uppercase tracking-meta text-ink-muted">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 font-medium">Agreement</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 pr-6 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const meta = AGREEMENT_STAGE_META[a.stage];
                  return (
                    <tr
                      key={a.id}
                      className="border-b border-border bg-surface transition-colors last:border-b-0 hover:bg-copper-soft/15"
                    >
                      <td className="px-5 py-3 font-sans text-sm">
                        <Link href={a.href} className="text-ink hover:text-copper">
                          <span className="font-medium">{a.contactName}</span>
                          {a.contactCompany ? (
                            <span className="ml-1 text-xs text-ink-muted">
                              · {a.contactCompany}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-3 font-sans text-sm text-ink-muted">
                        <Link href={a.href} className="hover:text-copper">
                          {a.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill label={meta.label} tone={meta.tone} />
                        {a.stage === 'awaiting_client' || a.stage === 'changes_requested' ? (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-meta text-ink-subtle">
                            {a.firstViewedAt ? `Opened ${a.viewCount}×` : 'Not opened yet'}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-sm tabular-nums text-ink">
                        {a.totalCents ? formatUSD(a.totalCents) : '—'}
                      </td>
                      <td className="px-3 py-3 pr-6 font-mono text-xs tabular-nums text-ink-subtle">
                        {a.signedAt
                          ? `Signed ${formatDate(a.signedAt)}`
                          : formatDate(a.lastActivityAt)}
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
