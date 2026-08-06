/**
 * The contracting entity's name, as of a given agreement version.
 *
 * The studio incorporated partway through: agreements from v1.3 are executed
 * by **LuxWeb Studio LLC**, everything before that was signed under the
 * trading name. A contract's body_md is frozen at signing, so the signature
 * block has to match the version it belongs to — rendering today's entity on
 * a 2025 contract would make the signature contradict the document above it.
 *
 * Unknown or missing version → the pre-LLC name, since that's what old
 * records are.
 */

const LLC_NAME = 'LuxWeb Studio LLC';
const TRADING_NAME = 'LuxWeb Studio';

/** First agreement version executed by the LLC. */
const LLC_FROM: [number, number] = [1, 3];

function parseVersion(version: string): [number, number] {
  const [major, minor] = version.replace(/^v/i, '').split('.');
  return [Number(major) || 0, Number(minor) || 0];
}

export function contractorPartyFor(version: string | null | undefined): string {
  if (!version) return TRADING_NAME;
  const [major, minor] = parseVersion(version);
  const [llcMajor, llcMinor] = LLC_FROM;
  if (major > llcMajor) return LLC_NAME;
  if (major === llcMajor && minor >= llcMinor) return LLC_NAME;
  return TRADING_NAME;
}

/** The entity the studio contracts as today. */
export const CURRENT_CONTRACTOR_PARTY = LLC_NAME;
