/**
 * Google reviews: the rules shared by the assistant's import route, the admin
 * Reviews page, and the public feed. Clients review the studio on Google; the
 * CRM keeps a read-only copy (crm.google_reviews), so nothing here ever writes
 * to Google.
 */

/** Opens the "rate and review" box on the studio's Google profile. */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CYLAiGVkb5wkECE/review';

export type SiteRuleInput = {
  rating: number;
  body: string | null;
  showOnSite: boolean | null;
  removedAt: string | null;
};

/**
 * Whether a review appears on luxwebstudio.dev. Kevin's switch wins; without
 * one, 4 and 5 star reviews with written text go up on their own. A review
 * that's gone from Google never shows, whatever the switch says.
 */
export function showsOnSite(r: SiteRuleInput): boolean {
  if (r.removedAt) return false;
  if (r.showOnSite !== null) return r.showOnSite;
  return r.rating >= 4 && !!r.body?.trim();
}

/** Lowercase, no accents or punctuation, single spaces — for comparing names. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The contact a reviewer is, when exactly one contact has the same full name.
 * Google shows whatever name the reviewer's account uses, so anything short
 * of one exact match is left for Kevin to link by hand.
 */
export function matchContact(
  reviewerName: string,
  contacts: Array<{ id: string; full_name: string }>,
): string | null {
  const target = normalizeName(reviewerName);
  if (!target) return null;
  const hits = contacts.filter((c) => normalizeName(c.full_name) === target);
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * How a reviewer is named in public: first name and last initial, so a full
 * identity never leaves the CRM. "Jane Q. Smith" -> "Jane S.", "Jane" -> "Jane".
 */
export function publicName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A Google reviewer';
  if (parts.length === 1) return parts[0];
  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${initial}.`;
}
