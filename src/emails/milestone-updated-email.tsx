import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type MilestoneUpdatedEmailProps = {
  recipientName: string;
  projectName: string;
  milestoneTitle: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  projectUrl: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Complete',
  blocked: 'Blocked',
};

export default function MilestoneUpdatedEmail(props: MilestoneUpdatedEmailProps) {
  const { recipientName, projectName, milestoneTitle, status, projectUrl } = props;
  return (
    <BaseLayout
      preview={`${milestoneTitle} — ${STATUS_LABEL[status]}`}
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        Milestone update
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {status === 'done'
          ? `A milestone on ${projectName} is done.`
          : `A milestone on ${projectName} just changed state.`}
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {projectName}
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {milestoneTitle}
        </Text>
        <Text className="mt-1 text-sm text-ink-muted">
          {STATUS_LABEL[status]}
        </Text>
      </Section>

      <EmailButton href={projectUrl}>View project</EmailButton>
    </BaseLayout>
  );
}

export function milestoneUpdatedSubject(p: MilestoneUpdatedEmailProps) {
  return `${p.milestoneTitle} · ${STATUS_LABEL[p.status]}`;
}
