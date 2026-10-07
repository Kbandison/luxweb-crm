/**
 * Normalize a typed full-name for comparison against the on-file name:
 *   - Unicode NFKC, so a precomposed "é" and "e" + combining accent (what
 *     some keyboards and pasted text produce) compare equal
 *   - typographic punctuation folded to ASCII: curly/modifier apostrophes
 *     and primes → ', curly double quotes → ", dash variants → -. iOS Smart
 *     Punctuation turns ' into ’ as you type, so "O'Brien" typed on an
 *     iPhone would otherwise never match the on-file name.
 *   - collapse whitespace runs to a single space, trim
 *   - lowercase
 *
 * Doesn't strip diacritics — "José" and "Jose" stay distinct, which is
 * the right behavior for legal-ish signing where exactness matters.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛ʼ′`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−﹘]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * True iff two names match after normalization. Use this for signature
 * verification: typed name must match the on-file `full_name` exactly.
 *
 * Returns false when either side is empty/null — better to refuse the
 * signature than to mis-attribute it.
 */
export function namesMatch(
  typed: string | null | undefined,
  onFile: string | null | undefined,
): boolean {
  if (!typed || !onFile) return false;
  return normalizeName(typed) === normalizeName(onFile);
}
