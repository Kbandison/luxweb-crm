/**
 * Shared base layout for every transactional email.
 * Neutral Light Clinical styling — safe across Apple Mail, Gmail, Outlook.
 * React Email strips inline CSS to maximize client compat.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

export function BaseLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                copper: '#B45309',
                ink: '#1A1A1A',
                'ink-muted': '#64748B',
                'ink-subtle': '#94A3B8',
                bg: '#FAFAFA',
                border: '#E5E5E5',
              },
            },
          },
        }}
      >
        <Body className="bg-bg font-sans text-ink">
          <Container className="mx-auto w-full max-w-[560px] py-10">
            {/* Wordmark */}
            <Section className="mb-8">
              <Text className="my-0 text-sm font-medium tracking-tight text-ink">
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: '#B45309',
                    marginRight: 10,
                    verticalAlign: 'middle',
                  }}
                />
                LuxWeb Studio
              </Text>
            </Section>

            <Section className="rounded-2xl border border-solid border-border bg-white p-8">
              {children}
            </Section>

            <Hr className="my-8 border-border" />
            <Text className="m-0 text-[11px] uppercase tracking-[0.2em] text-ink-subtle">
              LuxWeb Studio · portal.luxwebstudio.dev
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

// Button — inline styled for email client compat.
export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-block',
        padding: '10px 18px',
        backgroundColor: '#B45309',
        color: '#ffffff',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize: 14,
        fontWeight: 500,
        textDecoration: 'none',
        borderRadius: 8,
      }}
    >
      {children}
    </a>
  );
}
