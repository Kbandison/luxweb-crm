import { Heading, Section, Text } from '@react-email/components';
import { BaseLayout, EmailButton } from './base-layout';

export type RevisionUpdatedEmailProps = {
  recipientName: string;
  projectName: string;
  title: string;
  /** 'status' when the admin moved the request, 'comment' when they replied */
  kind: 'status' | 'comment';
  /** new status label when kind=status */
  statusLabel?: string;
  /** body of the admin reply when kind=comment */
  snippet?: string;
  revisionUrl: string;
};

export default function RevisionUpdatedEmail(props: RevisionUpdatedEmailProps) {
  const { recipientName, projectName, title, kind, statusLabel, snippet, revisionUrl } =
    props;
  const heading =
    kind === 'status' ? 'Revision status updated' : 'New reply on your revision';
  return (
    <BaseLayout
      preview={
        kind === 'status'
          ? `Status updated on ${title}`
          : `New reply on ${title}`
      }
    >
      <Text className="m-0 text-xs uppercase tracking-[0.22em] text-copper">
        {heading}
      </Text>
      <Heading className="mt-3 text-2xl font-medium tracking-tight text-ink">
        Hi {recipientName.split(' ')[0] || 'there'},
      </Heading>
      <Text className="mt-4 text-base leading-relaxed text-ink">
        {kind === 'status' ? (
          <>
            The team moved your revision on{' '}
            <strong>{projectName}</strong>
            {statusLabel ? (
              <>
                {' '}
                to <strong>{statusLabel}</strong>
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            The team replied on your revision for{' '}
            <strong>{projectName}</strong>.
          </>
        )}
      </Text>

      <Section className="my-6 rounded-xl border border-solid border-border bg-[#FAFAFA] p-6">
        <Text className="m-0 text-xs uppercase tracking-[0.2em] text-ink-muted">
          {projectName}
        </Text>
        <Text className="mt-2 text-lg font-medium tracking-tight text-ink">
          {title}
        </Text>
        {snippet ? (
          <Text className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            {snippet}
          </Text>
        ) : null}
      </Section>

      <EmailButton href={revisionUrl}>Open revision</EmailButton>
    </BaseLayout>
  );
}

export function revisionUpdatedSubject(p: RevisionUpdatedEmailProps) {
  return p.kind === 'status'
    ? `Status updated on ${p.title}`
    : `New reply on ${p.title}`;
}
