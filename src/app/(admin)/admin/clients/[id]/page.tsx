import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Topbar } from '@/components/admin/topbar';
import {
  getClientWithDetails,
  getContactProposals,
} from '@/lib/queries/admin';
import { InviteToPortalButton } from '@/components/admin/contacts/invite-button';
import { Monogram } from '@/components/admin/leads/monogram';
import { TagPill } from '@/components/admin/leads/tag-pill';
import { LeadScore } from '@/components/admin/leads/lead-score';
import { LeadProposalsSection } from '@/components/admin/leads/lead-proposals-section';
import {
  ClientTabs,
  type ClientTabKey,
} from '@/components/admin/clients/client-tabs';
import {
  DealsSection,
  ProjectsSection,
} from '@/components/admin/clients/deals-section';
import { NotesPanel } from '@/components/admin/clients/notes-panel';
import { ActivityList } from '@/components/admin/clients/activity-list';
import { DeleteContactButton } from '@/components/admin/contacts/delete-button';
import { formatUSD, formatDateLong } from '@/lib/formatters';

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const client = await getClientWithDetails(id);
  if (!client) notFound();
  const proposals = await getContactProposals(id);

  // Legacy ?tab=deals|projects|proposals all map to the new combined tab.
  const activeTab: ClientTabKey =
    tab === 'engagements' ||
    tab === 'deals' ||
    tab === 'projects' ||
    tab === 'proposals'
      ? 'engagements'
      : tab === 'notes' || tab === 'activity'
        ? tab
        : 'overview';

  const counts = {
    engagements:
      client.deals.length + client.projects.length + proposals.length,
    notes: client.notes.length,
    activity: client.activity.length,
  };

  return (
    <>
      <Topbar title={client.fullName} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sub-header / breadcrumb */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface px-8 py-3">
          <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
            <Link href="/admin/clients" className="hover:text-ink">
              Clients
            </Link>
            <span className="text-copper">/</span>
            <span className="text-ink">{client.fullName}</span>
          </nav>
          <DeleteContactButton
            contactId={client.id}
            contactName={client.fullName}
            kind="client"
            redirectTo="/admin/clients"
          />
        </div>

        {/* Hero — copper moment for this page */}
        <header className="relative isolate overflow-hidden border-b border-border bg-surface px-8 pb-8 pt-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
          />
          <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <Monogram name={client.fullName} size="lg" />

            <div className="min-w-0">
              <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
                {client.fullName}
              </h1>
              <p className="mt-1 font-sans text-sm text-ink-muted">
                {client.company ?? 'No company'}
                {client.email ? (
                  <>
                    <span className="mx-1.5 text-ink-subtle">·</span>
                    <span className="font-mono text-xs">{client.email}</span>
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <LeadScore score={client.leadScore} size="md" />
                {client.userId ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                    <span className="h-1 w-1 rounded-full bg-success" aria-hidden />
                    Portal access
                  </span>
                ) : (
                  <InviteToPortalButton
                    contactId={client.id}
                    contactEmail={client.email}
                    contactName={client.fullName}
                  />
                )}
                {client.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {client.tags.map((t) => (
                      <TagPill key={t} size="xs">
                        {t}
                      </TagPill>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right-side stats */}
            <dl className="grid grid-cols-3 gap-6 text-right md:gap-8">
              <Stat label="Open value" value={formatUSD(client.openValueCents)} />
              <Stat
                label="Deals"
                value={String(client.dealCount)}
                muted={client.dealCount === 0}
              />
              <Stat
                label="Projects"
                value={String(client.projectCount)}
                muted={client.projectCount === 0}
              />
            </dl>
          </div>
        </header>

        {/* Tabs */}
        <ClientTabs active={activeTab} counts={counts} />

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-8 py-8">
          {activeTab === 'overview' ? (
            <Overview client={client} />
          ) : null}
          {activeTab === 'engagements' ? (
            <Engagements
              client={client}
              proposals={proposals}
            />
          ) : null}
          {activeTab === 'notes' ? (
            <NotesPanel contactId={client.id} notes={client.notes} />
          ) : null}
          {activeTab === 'activity' ? (
            <ActivityList rows={client.activity} />
          ) : null}
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-xl font-medium tabular-nums tracking-tight ${
          muted ? 'text-ink-subtle' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Overview({
  client,
}: {
  client: import('@/lib/queries/admin').ClientWithDetails;
}) {
  return (
    <div className="space-y-10">
      <SectionHead number="01" title="Contact" />
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
        <Field label="Email" value={client.email ?? '—'} mono />
        <Field label="Phone" value={client.phone ?? '—'} mono />
        <Field label="Source" value={client.source ?? '—'} />
        <Field label="Created" value={formatDateLong(client.createdAt)} mono />
        <Field
          label="Last activity"
          value={formatDateLong(client.lastActivityAt)}
          mono
        />
      </dl>

      <SectionHead
        number="02"
        title="Recent deals"
        right={
          <Link
            href={`/admin/clients/${client.id}?tab=engagements`}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
          >
            View all →
          </Link>
        }
      />
      <DealsSection deals={client.deals.slice(0, 5)} />

      <SectionHead
        number="03"
        title="Recent activity"
        right={
          <Link
            href={`/admin/clients/${client.id}?tab=activity`}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper hover:underline"
          >
            View all →
          </Link>
        }
      />
      <ActivityList rows={client.activity.slice(0, 5)} />
    </div>
  );
}

function Engagements({
  client,
  proposals,
}: {
  client: import('@/lib/queries/admin').ClientWithDetails;
  proposals: import('@/lib/queries/admin').ProposalRow[];
}) {
  return (
    <div className="space-y-10">
      <SectionHead number="01" title={`Deals · ${client.deals.length}`} />
      <DealsSection deals={client.deals} />

      <SectionHead number="02" title={`Proposals · ${proposals.length}`} />
      <LeadProposalsSection contactId={client.id} proposals={proposals} />

      <SectionHead number="03" title={`Projects · ${client.projects.length}`} />
      <ProjectsSection projects={client.projects} />
    </div>
  );
}

function SectionHead({
  number,
  title,
  right,
}: {
  number: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-copper">
          {number}
        </span>
        <span aria-hidden className="h-3.5 w-px bg-copper/40" />
        <h2 className="font-display text-lg font-medium tracking-tight text-ink">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-sm text-ink' : 'font-sans text-sm text-ink'}>
        {value}
      </dd>
    </div>
  );
}
