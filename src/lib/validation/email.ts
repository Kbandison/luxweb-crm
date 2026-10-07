import { regexes } from 'zod/v4/core';

/**
 * The exact pattern `z.string().email()` checks server-side. Browsers'
 * type="email" accepts "jane@acme" (no TLD), which zod rejects — so forms
 * check this before submitting rather than surfacing a bare "Invalid
 * payload", and lenient ingest paths use it to drop junk to null.
 */
export function isValidEmail(s: string): boolean {
  return regexes.email.test(s);
}
