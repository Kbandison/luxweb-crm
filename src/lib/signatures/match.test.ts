// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { namesMatch, normalizeName } from './match';

describe('namesMatch', () => {
  it('accepts an iOS curly apostrophe for a straight one', () => {
    expect(namesMatch('Sean O’Brien', "Sean O'Brien")).toBe(true);
    expect(namesMatch("Sean O'Brien", 'Sean O’Brien')).toBe(true);
    expect(namesMatch('Sean O‘Brien', "Sean O'Brien")).toBe(true);
    expect(namesMatch('Sean OʼBrien', "Sean O'Brien")).toBe(true);
    expect(namesMatch('Sean O`Brien', "Sean O'Brien")).toBe(true);
  });

  it('accepts curly double quotes around a nickname', () => {
    expect(
      namesMatch('Robert “Bob” Smith', 'Robert "Bob" Smith'),
    ).toBe(true);
  });

  it('treats decomposed (NFD) accents like precomposed ones', () => {
    const nfd = 'José García';
    const nfc = 'José García';
    expect(nfd).not.toBe(nfc);
    expect(namesMatch(nfd, nfc)).toBe(true);
  });

  it('keeps diacritics significant', () => {
    expect(namesMatch('Jose Garcia', 'José García')).toBe(false);
  });

  it('folds dash variants to a hyphen', () => {
    for (const dash of ['‐', '‑', '–', '—', '−', '－']) {
      expect(namesMatch(`Mary${dash}Jane Smith`, 'Mary-Jane Smith')).toBe(true);
    }
  });

  it('ignores case, extra spaces, tabs, and non-breaking spaces', () => {
    expect(namesMatch('  sean   O’BRIEN\t', "Sean O'Brien")).toBe(true);
    expect(namesMatch('Sean O’Brien', "Sean O'Brien")).toBe(true);
    expect(namesMatch('Sean O\'Brien', "Sean  O'Brien ")).toBe(true);
  });

  it('still rejects genuinely different names', () => {
    expect(namesMatch("Shawn O'Brien", "Sean O'Brien")).toBe(false);
    expect(namesMatch('Sean OBrien', "Sean O'Brien")).toBe(false);
    expect(namesMatch('Mary Jane Smith', 'Mary-Jane Smith')).toBe(false);
    expect(namesMatch('Sean', "Sean O'Brien")).toBe(false);
  });

  it('rejects empty or missing names', () => {
    expect(namesMatch('', "Sean O'Brien")).toBe(false);
    expect(namesMatch("Sean O'Brien", null)).toBe(false);
    expect(namesMatch(undefined, undefined)).toBe(false);
  });
});

describe('normalizeName', () => {
  it('produces the canonical comparison form', () => {
    expect(normalizeName('  Sean   O’Brien–Smith ')).toBe(
      "sean o'brien-smith",
    );
  });
});
