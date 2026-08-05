import type { ProspectStatus } from '@/lib/outreach/meta';

/**
 * Translate a sending tool's outcome vocabulary into a CRM prospect status.
 *
 * ByteBoundless tracks `saved → contacted → replied → quoted → signed | lost`
 * (plus the older `responded`/`closed` from its original schema). None of that
 * is dial-shaped — its outreach is often the AI-drafted email — so the mapping
 * is about preserving *how far it got*, not inventing call activity.
 *
 * Anything unrecognised falls back to 'new': a lead that looks untouched gets
 * dialed again, which is a cheaper mistake than one that looks handled and
 * never gets called.
 */
const EXTERNAL_TO_CRM: Record<string, ProspectStatus> = {
  saved: 'new',
  contacted: 'contacted',
  replied: 'interested',
  responded: 'interested',
  quoted: 'interested',
  // Already a client — imported so nobody cold-calls them, and 'converted'
  // keeps them out of the working queue.
  signed: 'converted',
  closed: 'converted',
  lost: 'not_interested',
};

/**
 * Where each mapped status lands if the database predates a status value.
 * Only 'contacted' is new enough to need one.
 */
const PRE_MIGRATION_FALLBACK: Partial<Record<ProspectStatus, ProspectStatus>> = {
  contacted: 'new',
};

export function mapExternalStatus(external: string | null | undefined): ProspectStatus {
  if (!external) return 'new';
  return EXTERNAL_TO_CRM[external.trim().toLowerCase()] ?? 'new';
}

/** The same status, degraded to something any version of the enum accepts. */
export function degradeStatus(status: ProspectStatus): ProspectStatus {
  return PRE_MIGRATION_FALLBACK[status] ?? status;
}

/**
 * Statuses that mean real outreach already happened, so the prospect gets a
 * history entry and an attempt on the counter. 'new' doesn't; neither does
 * 'converted', where the work was a sale rather than a dial.
 */
export function isWorkedStatus(status: ProspectStatus): boolean {
  return status === 'contacted' || status === 'interested' || status === 'not_interested';
}
