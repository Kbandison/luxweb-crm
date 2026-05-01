import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type RevisionRequestedEmailProps = {
  adminName: string;
  clientName: string;
  projectName: string;
  title: string;
  bodySnippet: string;
  /** 'created' on the initial filing, 'comment' on subsequent client replies */
  kind: 'created' | 'comment';
  revisionUrl: string;
};

export default function RevisionRequestedEmail(
  props: RevisionRequestedEmailProps,
) {
  const { adminName, clientName, projectName, title, bodySnippet, kind, revisionUrl } =
    props;
  const isNew = kind === 'created';
  return (
    <BaseLayout
      preview={
        isNew
          ? `${clientName} filed a revision on ${projectName}`
          : `${clientName} replied on a revision in ${projectName}`
      }
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        {isNew ? 'New revision request' : 'New client reply'}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {adminName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        <strong>{clientName}</strong>{' '}
        {isNew
          ? `filed a revision request on ${projectName}.`
          : `replied on a revision in ${projectName}.`}
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {projectName}
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {title}
        </Text>
        {bodySnippet ? (
          <Text className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            {bodySnippet}
          </Text>
        ) : null}
      </Section>

      <EmailButton href={revisionUrl}>Open revision</EmailButton>
    </BaseLayout>
  );
}

export function revisionRequestedSubject(p: RevisionRequestedEmailProps) {
  return p.kind === 'created'
    ? `New revision request: ${p.title}`
    : `${p.clientName} replied: ${p.title}`;
}
