import type { ProposalContent } from '@/lib/types/proposal';
import { formatDateLong, formatDateTimeLongTz, formatUSD } from '@/lib/formatters';

export type ProposalSignatureBlock = {
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedByIp: string | null;
  acceptedByUserAgent: string | null;
};

/**
 * Renders a ProposalContent as the client will see it in the portal.
 * Used both in the admin editor's preview pane and the client portal's
 * proposal view (Step 8 — reuses the same component for fidelity).
 */
export function ProposalPreview({
  title,
  content,
  signature,
}: {
  title: string;
  content: ProposalContent;
  signature?: ProposalSignatureBlock;
}) {
  const preparedDate = formatDateLong(content.prepared_date);

  return (
    <article className="space-y-10 font-sans text-ink">
      {/* Cover */}
      <section className="relative isolate overflow-hidden rounded-2xl border border-border bg-surface p-8 md:p-10 copper-mesh print-plain print-avoid-break">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-copper">
          Proposal · v{content.version}
        </p>
        <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-ink md:text-5xl">
          {title}
        </h1>
        <div className="copper-rule mt-6 h-px w-32" />
        <dl className="mt-6 grid gap-x-8 gap-y-3 font-mono text-xs tabular-nums text-ink-muted sm:grid-cols-3">
          <div>
            <dt className="uppercase tracking-[0.18em] text-ink-subtle">
              Prepared for
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {content.client.name || '—'}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.18em] text-ink-subtle">
              Contact
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {content.client.contact_email || '—'}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.18em] text-ink-subtle">
              Prepared date
            </dt>
            <dd className="mt-1 text-sm text-ink">{preparedDate}</dd>
          </div>
        </dl>
      </section>

      {/* Executive summary */}
      {content.executive_summary ? (
        <Section number="01" title="Executive summary">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">
            {content.executive_summary}
          </p>
        </Section>
      ) : null}

      {/* Goals */}
      {content.project_goals.length > 0 ? (
        <Section number="02" title="Project goals">
          <ul className="space-y-4">
            {content.project_goals.map((g, i) => (
              <li
                key={i}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <p className="font-display text-base font-medium text-ink">
                  {g.title}
                </p>
                {g.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                    {g.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Scope */}
      <Section number="03" title="Scope">
        <dl className="grid gap-x-8 gap-y-5 rounded-xl border border-border bg-surface p-6 sm:grid-cols-2">
          <Field label="Pages" value={String(content.scope.pages_count)} mono />
          <Field
            label="Post-launch support"
            value={`${content.scope.post_launch_support_months} months`}
            mono
          />
          <Field label="Design" value={content.scope.design || '—'} multiline />
          <Field
            label="Content migration"
            value={content.scope.content_migration || '—'}
            multiline
          />
          <Field
            label="Security"
            value={content.scope.security || '—'}
            multiline
          />
          <Field
            label="Performance"
            value={content.scope.performance || '—'}
            multiline
          />
          {content.scope.integrations.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
                Integrations
              </dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {content.scope.integrations.map((i) => (
                  <span
                    key={i}
                    className="rounded-full bg-copper-soft/55 px-2 py-0.5 font-sans text-xs font-medium text-copper"
                  >
                    {i}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </Section>

      {/* Out of scope */}
      {content.out_of_scope.length > 0 ? (
        <Section number="04" title="Out of scope">
          <ul className="list-disc space-y-1 rounded-xl border border-border bg-surface p-6 pl-10 text-sm text-ink">
            {content.out_of_scope.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Timeline */}
      <Section number="05" title="Timeline">
        <div className="grid gap-4 md:grid-cols-3">
          {(['phase_1', 'phase_2', 'phase_3'] as const).map((key, i) => {
            const phase = content.timeline[key];
            return (
              <div
                key={key}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-copper">
                  Phase {i + 1}
                </p>
                <h4 className="mt-1 font-display text-lg font-medium text-ink">
                  {phase.name}
                </h4>
                <p className="mt-1 font-mono text-xs tabular-nums text-ink-muted">
                  {phase.weeks} {Number(phase.weeks) === 1 ? 'week' : 'weeks'}
                </p>
                {phase.items.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-ink-muted">
                    {phase.items.map((x, j) => (
                      <li key={j}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-center font-mono text-xs tabular-nums text-ink-muted">
          Total {content.timeline.total_weeks} weeks
          {content.timeline.target_launch
            ? ` · Target launch ${formatDateLong(content.timeline.target_launch)}`
            : ''}
        </p>
      </Section>

      {/* Investment */}
      <Section number="06" title="Investment">
        <div className="rounded-2xl border border-border bg-surface p-8 print-avoid-break">
          <div className="text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-copper">
              Total
            </p>
            <p className="mt-2 font-mono text-5xl font-medium leading-none tabular-nums tracking-tight text-ink md:text-6xl">
              {formatUSD(content.investment.total_cents)}
            </p>
          </div>

          {content.investment.milestones.length > 0 ? (
            <div className="mt-8">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
                Payment schedule
              </p>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {content.investment.milestones.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-sans text-sm font-medium text-ink">
                        {m.label}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
                        {m.due}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium tabular-nums text-ink">
                        {formatUSD(m.amount_cents)}
                      </p>
                      <p className="font-mono text-[10px] tabular-nums text-ink-subtle">
                        {m.percent}%
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-6 text-center font-mono text-[11px] tabular-nums text-ink-subtle">
            Net {content.investment.net_days} · Late fee{' '}
            {content.investment.late_fee}
          </p>
        </div>
      </Section>

      {/* Assumptions */}
      {content.assumptions.length > 0 ? (
        <Section number="07" title="Assumptions">
          <ul className="list-disc space-y-1 rounded-xl border border-border bg-surface p-6 pl-10 text-sm text-ink">
            {content.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Why LuxWeb */}
      {content.why_luxweb.length > 0 ? (
        <Section number="08" title="Why LuxWeb">
          <ul className="space-y-4">
            {content.why_luxweb.map((item, i) => {
              // Tolerate legacy rows stored as string[] before the titled
              // shape landed — render those as a single bullet line.
              const legacy = typeof item === 'string';
              const title = legacy ? null : item.title;
              const description = legacy
                ? (item as unknown as string)
                : item.description;
              return (
                <li
                  key={i}
                  className="rounded-xl border border-border bg-surface p-5"
                >
                  {title ? (
                    <p className="font-display text-base font-medium text-ink">
                      {title}
                    </p>
                  ) : null}
                  {description ? (
                    <p
                      className={
                        title
                          ? 'mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted'
                          : 'whitespace-pre-wrap text-sm leading-relaxed text-ink'
                      }
                    >
                      {description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {/* Next steps */}
      {content.next_steps.length > 0 ? (
        <Section number="09" title="Next steps">
          <ol className="list-decimal space-y-1 rounded-xl border border-border bg-surface p-6 pl-10 text-sm text-ink">
            {content.next_steps.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </Section>
      ) : null}

      {signature?.acceptedAt && signature.acceptedByName ? (
        <section className="relative isolate overflow-hidden rounded-2xl border border-success/30 bg-success/5 p-6 print-avoid-break">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/25"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-success">
                Electronically signed
              </p>
              <p
                className="mt-1 font-display text-2xl italic tracking-tight text-ink"
                style={{
                  fontFamily:
                    '"Brush Script MT", "Apple Chancery", "Lucida Handwriting", cursive',
                }}
              >
                {signature.acceptedByName}
              </p>
              <dl className="mt-4 font-mono text-[11px] tabular-nums text-ink-muted">
                <dt className="uppercase tracking-[0.16em] text-ink-subtle">
                  Date
                </dt>
                <dd className="mt-1 text-ink">
                  {formatDateTimeLongTz(signature.acceptedAt)}
                </dd>
              </dl>
              <p className="mt-3 font-sans text-[11px] text-ink-subtle">
                For anti-repudiation, additional technical metadata (IP
                address, user agent) is captured in the admin audit log but
                never displayed or printed on the proposal itself.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <p className="pt-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">
        Agreement v{content.agreement_version}
      </p>
    </article>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-semibold tabular-nums text-copper">
          {number}
        </span>
        <span aria-hidden className="h-3.5 w-px bg-copper/40" />
        <h2 className="font-display text-xl font-medium tracking-tight text-ink">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono = false,
  multiline = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted">
        {label}
      </dt>
      <dd
        className={
          mono
            ? 'mt-1 font-mono text-sm tabular-nums text-ink'
            : multiline
              ? 'mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink'
              : 'mt-1 text-sm text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}
