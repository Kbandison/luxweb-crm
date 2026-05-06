/**
 * Normalize a typed full-name for comparison against the on-file name:
 *   - lowercase
 *   - trim leading/trailing whitespace
 *   - collapse internal whitespace runs to a single space
 *
 * Doesn't strip diacritics — "José" and "Jose" stay distinct, which is
 * the right behavior for legal-ish signing where exactness matters.
 */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
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
