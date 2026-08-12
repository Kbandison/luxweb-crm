/**
 * The studio's public identity — the details clients see on messages and in
 * the portal. One place so the entity name, support address, and business
 * number can't drift apart across surfaces.
 *
 * The Agreement templates in `src/content/` deliberately carry their own
 * copies: a signed contract is a frozen legal record and must not change when
 * these values do. Same reason `contractorPartyFor` reads the party from the
 * agreement version rather than from here.
 */
export const STUDIO = {
  /** Trading name — branding, wordmark, email sender. */
  name: 'LuxWeb Studio',
  /** Registered entity — contracts, invoices, the email footer. */
  legalName: 'LuxWeb Studio LLC',
  email: 'support@luxwebstudio.dev',
  /** Business line, as displayed. */
  phone: '718-635-0159',
  portal: 'portal.luxwebstudio.dev',
} as const;

/** E.164 for `tel:` links, so a tap dials on mobile. */
export const STUDIO_PHONE_HREF = 'tel:+17186350159';
export const STUDIO_EMAIL_HREF = `mailto:${STUDIO.email}`;
