import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatDateTime, formatUSD } from '@/lib/formatters';

export type ProposalAcceptedClientEmailProps = {
  recipientName: string;
  title: string;
  totalCents: number | null;
  portalUrl: string;
  acceptedAt: string;
};

/**
 * Confirmation email to the client right after they accept a proposal.
 * Sets expectations for the next step — we counter-sign, then they sign,
 * then deposit — so the client doesn't think the deal is in their court.
 */
export default function ProposalAcceptedClientEmail(
  props: ProposalAcceptedClientEmailProps,
) {
  const { recipientName, title, totalCents, portalUrl, acceptedAt } = props;
  return (
    <BaseLayout preview={`Thanks for accepting ${title}`}>
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Proposal accepted
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        Thanks for accepting your proposal on {formatDateTime(acceptedAt)}.
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

      <Text className="mt-2 text-base leading-relaxed text-ink">
        <strong>What happens next:</strong>
      </Text>
      <Text className="mt-2 text-sm leading-relaxed text-ink-muted">
        1. We counter-sign the agreement on our end.
        <br />
        2. You&apos;ll get an email with a link to add your signature.
        <br />
        3. Once signed, we send the deposit invoice and kick off the
        project.
      </Text>

      <EmailButton href={portalUrl}>Open client portal</EmailButton>
    </BaseLayout>
  );
}

export function proposalAcceptedClientSubject(
  p: ProposalAcceptedClientEmailProps,
) {
  return `Thanks for accepting ${p.title}`;
}
