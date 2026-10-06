import { describe, expect, it } from 'vitest';
import { agreementStage, liveContract } from './stage';

const c = (id: string, status: string, created_at: string) => ({ id, status, created_at });

describe('agreementStage', () => {
  it('follows the draft until a contract exists', () => {
    expect(agreementStage('draft', [])).toBe('draft');
    expect(agreementStage('sent', [])).toBe('sent');
    expect(agreementStage('accepted', [])).toBe('needs_countersign');
    expect(agreementStage('rejected', [])).toBe('declined');
    expect(agreementStage('expired', [])).toBe('expired');
  });

  it('follows the live contract once there is one', () => {
    expect(agreementStage('accepted', [c('1', 'pending_client_signature', '2026-10-01')])).toBe(
      'awaiting_client',
    );
    expect(agreementStage('accepted', [c('1', 'pending_signature', '2026-10-01')])).toBe(
      'awaiting_client',
    );
    expect(agreementStage('accepted', [c('1', 'signed', '2026-10-01')])).toBe('signed');
  });

  it('reads a reissued agreement by its newest live contract', () => {
    expect(
      agreementStage('accepted', [
        c('old', 'void', '2026-09-01'),
        c('new', 'signed', '2026-10-01'),
      ]),
    ).toBe('signed');
  });

  it('calls an accepted agreement with only voided contracts voided', () => {
    expect(agreementStage('accepted', [c('1', 'void', '2026-10-01')])).toBe('void');
  });
});

describe('liveContract', () => {
  it('ignores voided contracts and takes the newest', () => {
    expect(
      liveContract([
        c('a', 'pending_client_signature', '2026-09-01'),
        c('b', 'void', '2026-10-05'),
        c('c', 'signed', '2026-10-01'),
      ])?.id,
    ).toBe('c');
    expect(liveContract([c('a', 'void', '2026-09-01')])).toBeNull();
  });
});
