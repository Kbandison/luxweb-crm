import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';
import { formatUSD } from '@/lib/formatters';

export type CarePlanActivatedEmailProps = {
  recipientName: string;
  projectName: string | null;
  amountCents: number;
  interval: 'month' | 'year';
  portalUrl: string;
};

export default function CarePlanActivatedEmail(
  props: CarePlanActivatedEmailProps,
) {
  const { recipientName, projectName, amountCents, interval, portalUrl } = props;
  return (
    <BaseLayout preview="Your LuxWeb care plan is active">
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Care plan active
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        Your care plan is now active
        {projectName ? (
          <>
            {' '}
            for <strong>{projectName}</strong>
          </>
        ) : null}
        . Thanks for staying on with LuxWeb.
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          Plan
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {formatUSD(amountCents)} / {interval === 'year' ? 'year' : 'month'}
        </Text>
        <Text className="mt-1 text-sm text-ink-muted">
          You can update or cancel anytime from your portal.
        </Text>
      </Section>

      <EmailButton href={portalUrl}>Open portal</EmailButton>
    </BaseLayout>
  );
}

export function carePlanActivatedSubject(p: CarePlanActivatedEmailProps) {
  return p.projectName
    ? `Care plan active for ${p.projectName}`
    : 'Your LuxWeb care plan is active';
}
