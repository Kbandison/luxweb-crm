/**
 * Make text printable in the PDF's built-in Helvetica.
 *
 * The standard PDF fonts only cover Windows-1252 (ASCII, Latin-1, and a
 * handful of typographic marks like — ’ “ ” •). Anything outside that
 * renders as garbage, and the Agreement template itself uses "→"
 * ("Contractor → Client"). Rather than ship a font file, characters outside
 * the set are spelled out in ASCII. The signed record is body_md (and its
 * SHA-256); the PDF is a faithful rendering of it.
 */

/** Windows-1252's characters above Latin-1's control range (0x80–0x9F slots). */
const CP1252_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''),
);

const SPELLED_OUT: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '✓': 'v',
  '✔': 'v',
  '✗': 'x',
  '\u2212': '-',
  '\u2010': '-',
  '\u2011': '-',
  '\u00a0': ' ',
  '\u2009': ' ',
  '\u202f': ' ',
};

export function pdfSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    // The map wins — it also normalises a few printable-but-unwanted
    // characters, like the non-breaking space.
    const spelled = SPELLED_OUT[ch];
    if (spelled !== undefined) {
      out += spelled;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    const printable =
      code < 0x80 || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.has(ch);
    out += printable ? ch : '?';
  }
  return out;
}
