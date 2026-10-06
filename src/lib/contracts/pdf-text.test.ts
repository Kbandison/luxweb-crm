import { describe, expect, it } from 'vitest';
import { pdfSafe } from './pdf-text';

describe('pdfSafe', () => {
  it('keeps the typography the template relies on', () => {
    const text = '§ 1.2 — “Client” · Aurora’s site • $4,000 · café';
    expect(pdfSafe(text)).toBe(text);
  });

  it('spells out arrows and comparison marks', () => {
    expect(pdfSafe('Contractor → Client')).toBe('Contractor -> Client');
    expect(pdfSafe('Lighthouse ≥ 90')).toBe('Lighthouse >= 90');
  });

  it('turns odd spaces into plain spaces', () => {
    expect(pdfSafe('Net 7')).toBe('Net 7');
  });

  it('marks anything else it cannot print', () => {
    expect(pdfSafe('Logo 🚀 refresh')).toBe('Logo ? refresh');
  });
});
