/**
 * Truncate a string to at most `max` grapheme clusters, appending an
 * ellipsis if it had to cut. Unlike `.slice(0, n)`, this won't split a
 * multi-byte emoji like 👨‍👩‍👧 down the middle.
 *
 * Uses `Intl.Segmenter` — available natively in Node 18+ and all modern
 * browsers, so no polyfill is needed for our targets.
 */
export function truncateGraphemes(s: string, max: number): string {
  if (max <= 0) return '';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let out = '';
  let count = 0;
  for (const seg of segmenter.segment(s)) {
    if (count >= max) return out + '…';
    out += seg.segment;
    count++;
  }
  return out;
}

/**
 * A website rendered as a label: protocol and trailing slash dropped, then
 * capped so a long path can't blow out the row it sits in. Pair it with a
 * `title` carrying the full URL.
 */
export function displayUrl(url: string, max = 34): string {
  const bare = url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return truncateGraphemes(bare, max);
}
