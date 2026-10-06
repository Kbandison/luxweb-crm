/**
 * Every Agreement template revision that exists on disk under
 * src/content/agreement-v{version}.md. Contracts that were signed under an
 * older revision keep rendering from their frozen body_md; this list is what
 * a NEW contract is allowed to render from.
 *
 * Adding a revision: drop the markdown file in src/content, append the
 * version here, and bump CURRENT_AGREEMENT_VERSION.
 */
export const AGREEMENT_VERSIONS = ['1.1', '1.2', '1.3', '1.4'] as const;
export type AgreementVersion = (typeof AGREEMENT_VERSIONS)[number];

/**
 * The revision a proposal is pinned to the moment it's sent. Drafts don't
 * get to choose: an older draft still carrying "1.2" would otherwise render
 * a pre-LLC contract after the studio incorporated.
 */
export const CURRENT_AGREEMENT_VERSION: AgreementVersion = '1.4';

/** Strip the optional "v" prefix — contracts store "v1.4", proposals "1.4". */
export function normalizeAgreementVersion(
  version: string | null | undefined,
): string {
  return (version ?? '').trim().replace(/^v/i, '');
}

export function isKnownAgreementVersion(
  version: string | null | undefined,
): version is AgreementVersion {
  return (AGREEMENT_VERSIONS as readonly string[]).includes(
    normalizeAgreementVersion(version),
  );
}
