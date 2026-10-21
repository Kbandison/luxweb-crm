import { describe, expect, it } from 'vitest';
import { matchExistingContact } from './contact-match';

const contacts = [
  { id: 'web-lead', email: 'Sam@Acme.com', phone: null },
  { id: 'office', email: null, phone: '(770) 555-0142' },
  { id: 'other', email: 'jo@other.com', phone: '404-555-9999' },
];

describe('matchExistingContact', () => {
  it('matches an email regardless of case and spacing', () => {
    expect(matchExistingContact(contacts, ' sam@acme.com ', null)?.id).toBe('web-lead');
  });

  it('matches a phone regardless of formatting', () => {
    expect(matchExistingContact(contacts, null, '770.555.0142')?.id).toBe('office');
  });

  it('prefers the email match over a phone match', () => {
    expect(matchExistingContact(contacts, 'jo@other.com', '7705550142')?.id).toBe('other');
  });

  it('finds nothing for a new person', () => {
    expect(matchExistingContact(contacts, 'new@biz.com', '678-555-0000')).toBeNull();
  });

  it('finds nothing when there is nothing to match on', () => {
    expect(matchExistingContact(contacts, null, '')).toBeNull();
  });
});
