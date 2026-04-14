import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatUSD } from '@/lib/formatters';

export type ProposalSentEmailProps = {
  recipientName: string;
  title: string;
  totalCents: number | null;
  proposalUrl: string;
};

export default function ProposalSentEmail(props: ProposalSentEmailProps) {
  const { recipientName, title, totalCents, proposalUrl } = props;
  return (
    <BaseLayout preview={`New proposal — ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Proposal ready
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        Your proposal is ready for review in your portal.
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

      <EmailButton href={proposalUrl}>Review proposal</EmailButton>

      <Text className="mt-6 text-sm text-ink-muted">
        Sign electronically from the portal when you&apos;re ready.
      </Text>
    </BaseLayout>
  );
}

export function proposalSentSubject(p: ProposalSentEmailProps) {
  return `Proposal ready · ${p.title}`;
}
