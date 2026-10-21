import { normEmail, normPhone } from '@/lib/outreach/dedupe';

export type ContactKey = { id: string; email: string | null; phone: string | null };

/**
 * The existing contact a newly booked prospect already is, if any — matched
 * the way the call list dedupes (lowercased email, phone digits). Email wins
 * over phone: a shared office line is weaker evidence than an inbox.
 */
export function matchExistingContact(
  contacts: ContactKey[],
  email: string | null | undefined,
  phone: string | null | undefined,
): ContactKey | null {
  const e = normEmail(email);
  const p = normPhone(phone);
  if (e) {
    const byEmail = contacts.find((c) => normEmail(c.email) === e);
    if (byEmail) return byEmail;
  }
  if (p) {
    const byPhone = contacts.find((c) => normPhone(c.phone) === p);
    if (byPhone) return byPhone;
  }
  return null;
}
