import { describe, expect, it } from 'vitest';
import { renderAgreementPdf } from './pdf';
import { deriveContractVariables, renderAgreement } from './render';
import { bodyFingerprint, executedCopyFilename } from './after-sign';
import { defaultProposalContent, pairTimelineAndMilestones } from '@/lib/types/proposal';

async function currentBody(): Promise<string> {
  const c = pairTimelineAndMilestones(
    defaultProposalContent({ clientName: 'Dana Whitfield', clientEmail: 'dana@aurora.example' }),
  );
  c.investment.total_cents = 400000;
  c.investment.milestones = c.investment.milestones.map((m) => ({
    ...m,
    amount_cents: Math.round((400000 * m.percent) / 100),
  }));
  const { body_md } = await renderAgreement(
    deriveContractVariables(c, { effectiveDate: '2026-10-06' }),
    { version: c.agreement_version },
  );
  return body_md;
}

describe('executed agreement PDF', () => {
  it('renders the current agreement, signatures and audit trail', async () => {
    const body = await currentBody();
    const pdf = await renderAgreementPdf({
      title: 'Aurora Dental site build',
      agreementVersion: '1.5',
      bodyMd: body,
      bodySha256: bodyFingerprint(body),
      contractor: {
        party: 'LuxWeb Studio LLC',
        name: 'Kevin Bandison',
        signedAt: '2026-10-06T14:02:11.000Z',
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
      },
      client: {
        party: 'Dana Whitfield',
        name: 'Dana Whitfield',
        signedAt: '2026-10-07T16:45:00.000Z',
        ip: '198.51.100.22',
        userAgent: 'Mozilla/5.0',
      },
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // A real multi-page document, not an empty shell.
    expect(pdf.length).toBeGreaterThan(20_000);
  }, 30_000);
});

describe('bodyFingerprint', () => {
  it('is stable for the same text and changes with any edit', async () => {
    const body = await currentBody();
    expect(bodyFingerprint(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(bodyFingerprint(body)).toBe(bodyFingerprint(body));
    expect(bodyFingerprint(body.replace('$4,000', '$4,001'))).not.toBe(bodyFingerprint(body));
  });
});

describe('executedCopyFilename', () => {
  it('slugs the title', () => {
    expect(executedCopyFilename('Aurora Dental — Site Build!', '1.5')).toBe(
      'luxweb-agreement-aurora-dental-site-build-v1.5.pdf',
    );
    expect(executedCopyFilename('***', '1.5')).toBe('luxweb-agreement-signed-v1.5.pdf');
  });
});
