import { describe, expect, it } from 'vitest';
import {
  ADMIN_EMAIL_PREFS,
  ALL_EMAIL_PREF_KEYS,
  CLIENT_EMAIL_PREFS,
  pickEmailPrefs,
} from './email-prefs';

describe('pickEmailPrefs', () => {
  it('keeps every toggle the catalogue renders', () => {
    const all = Object.fromEntries(CLIENT_EMAIL_PREFS.map((p) => [p.key, false]));
    expect(pickEmailPrefs(all, CLIENT_EMAIL_PREFS)).toEqual(all);
  });

  it('drops stale or unknown keys instead of failing the save', () => {
    expect(
      pickEmailPrefs({ invoice_overdue: false, proposal_sent: false, bogus: true }, CLIENT_EMAIL_PREFS),
    ).toEqual({ invoice_overdue: false });
  });

  it("keeps admin toggles to the admin catalogue", () => {
    expect(pickEmailPrefs({ new_lead: false, invoice_overdue: false }, ADMIN_EMAIL_PREFS)).toEqual({
      new_lead: false,
    });
  });
});

describe('ALL_EMAIL_PREF_KEYS', () => {
  it('covers both catalogues once each', () => {
    const keys = [...CLIENT_EMAIL_PREFS, ...ADMIN_EMAIL_PREFS].map((p) => p.key);
    expect(new Set(ALL_EMAIL_PREF_KEYS)).toEqual(new Set(keys));
    expect(ALL_EMAIL_PREF_KEYS.length).toBe(new Set(keys).size);
  });
});
