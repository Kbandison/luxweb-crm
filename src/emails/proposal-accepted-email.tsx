import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateTime, formatUSD } from '@/lib/formatters';

export type ProposalAcceptedEmailProps = {
  adminName: string;
  clientName: string;
  title: string;
  totalCents: number | null;
  proposalUrl: string;
  acceptedAt: string;
};

export default function ProposalAcceptedEmail(props: ProposalAcceptedEmailProps) {
  const { adminName, clientName, title, totalCents, proposalUrl, acceptedAt } =
    props;
  return (
    <BaseLayout preview={`${clientName} accepted ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Proposal accepted
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {adminName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        <strong>{clientName}</strong> accepted the proposal on{' '}
        {formatDateTime(acceptedAt)}.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          Proposal
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {title}
        </Text>
        {totalCents != null && totalCents > 0 ? (
          <Text className="mt-1 text-sm text-ink-muted">
            Investment · {formatUSD(totalCents)}
          </Text>
        ) : null}
      </Section>

      <EmailButton href={proposalUrl}>Open in CRM</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        The signed name, IP, and timestamp are captured on the audit log.
      </Text>
    </BaseLayout>
  );
}

export function proposalAcceptedSubject(p: ProposalAcceptedEmailProps) {
  return `${p.clientName} accepted ${p.title}`;
}
