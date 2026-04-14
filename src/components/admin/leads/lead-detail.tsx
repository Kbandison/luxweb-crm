import Link from 'next/link';
import type { ContactRow, ProposalRow } from '@/lib/queries/admin';
import { InviteToPortalButton } from '@/components/admin/contacts/invite-button';
import { LeadProposalsSection } from './lead-proposals-section';
import { LeadScore } from './lead-score';
import { TagPill } from './tag-pill';
import { Monogram } from './monogram';
import { formatDateLong } from '@/lib/formatters';

export function LeadDetail({
  lead,
  proposals,
}: {
  lead: ContactRow;
  proposals: ProposalRow[];
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Header with the per-pane copper moment */}
      <header className="relative isolate overflow-hidden border-b border-border px-8 py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-copper/18 via-gold/8 to-transparent blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px copper-rule"
        />

        <div className="relative flex items-start gap-5">
          <Monogram name={lead.fullName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl font-medium tracking-tight text-ink">
              {lead.fullName}
            </h2>
            <p className="mt-1 font-sans text-sm text-ink-muted">
              {lead.company ?? 'No company'}
              {lead.source ? (
                <>
                  <span className="mx-1.5 text-ink-subtle">·</span>
                  via <span className="text-ink">{lead.source}</span>
                </>
              ) : null}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <LeadScore score={lead.leadScore} size="md" />
              {lead.userId ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                  <span className="h-1 w-1 rounded-full bg-success" aria-hidden />
                  Portal access
                </span>
              ) : (
                <InviteToPortalButton
                  contactId={lead.id}
                  contactEmail={lead.email}
                  contactName={lead.fullName}
                />
              )}
            </div>
          </div>

          {/* Back-to-list on tablet */}
          <Link
            href="/admin/leads"
            className="shrink-0 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted transition-colors hover:border-border-strong hover:text-ink lg:hidden"
          >
            ← Back
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="space-y-10">
          <Section number="01" title="Contact" />
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field label="Email" value={lead.email ?? '—'} mono />
            <Field label="Phone" value={lead.phone ?? '—'} mono />
            <Field label="Company" value={lead.company ?? '—'} />
            <Field label="Source" value={lead.source ?? '—'} />
          </dl>

          <Section number="02" title="Tags" />
          {lead.tags.length === 0 ? (
            <p className="font-sans text-sm text-ink-muted">No tags.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lead.tags.map((t) => (
                <TagPill key={t}>{t}</TagPill>
              ))}
            </div>
          )}

          <Section number="03" title="Proposals" />
          <LeadProposalsSection contactId={lead.id} proposals={proposals} />

          <Section number="04" title="Timeline" />
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field
              label="Created"
              value={formatDateLong(lead.createdAt)}
              mono
            />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Section({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-lg font-semibold tabular-nums text-copper">
        {number}
      </span>
      <span aria-hidden className="h-3.5 w-px bg-copper/40" />
      <h3 className="font-display text-lg font-medium tracking-tight text-ink">
        {title}
      </h3>
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
      <dd
        className={
          mono
            ? 'font-mono text-sm text-ink'
            : 'font-sans text-sm text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function LeadDetailEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-copper/15 via-copper-soft/50 to-transparent ring-1 ring-copper/15">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-copper/70"
          aria-hidden
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <p className="mt-5 font-display text-lg font-medium text-ink">
        No lead selected
      </p>
      <p className="mt-1.5 max-w-sm font-sans text-sm text-ink-muted">
        Choose a lead from the list to see their details, or press{' '}
        <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs tabular-nums text-ink-muted">
          + New lead
        </kbd>{' '}
        to add one.
      </p>
    </div>
  );
}
