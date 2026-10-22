import { describe, expect, it } from 'vitest';
import { matchContact, normalizeName, publicName, showsOnSite } from './rules';

describe('showsOnSite', () => {
  const base = { rating: 5, body: 'Great work', showOnSite: null, removedAt: null };

  it('puts 4 and 5 star reviews with text up on their own', () => {
    expect(showsOnSite(base)).toBe(true);
    expect(showsOnSite({ ...base, rating: 4 })).toBe(true);
  });

  it('keeps 1 to 3 stars and star-only reviews off by default', () => {
    expect(showsOnSite({ ...base, rating: 3 })).toBe(false);
    expect(showsOnSite({ ...base, body: '   ' })).toBe(false);
    expect(showsOnSite({ ...base, body: null })).toBe(false);
  });

  it("follows Kevin's switch either way", () => {
    expect(showsOnSite({ ...base, showOnSite: false })).toBe(false);
    expect(showsOnSite({ ...base, rating: 2, showOnSite: true })).toBe(true);
  });

  it('never shows a review that is gone from Google', () => {
    expect(showsOnSite({ ...base, showOnSite: true, removedAt: '2026-10-22T00:00:00Z' })).toBe(false);
  });
});

describe('matchContact', () => {
  const contacts = [
    { id: 'a', full_name: 'José  Ramírez' },
    { id: 'b', full_name: 'Sam Lee' },
    { id: 'c', full_name: 'sam lee' },
  ];

  it('matches one contact ignoring case, accents, and spacing', () => {
    expect(normalizeName(' José  Ramírez ')).toBe('jose ramirez');
    expect(matchContact('Jose Ramirez', contacts)).toBe('a');
  });

  it('leaves two possible matches and no match for Kevin', () => {
    expect(matchContact('Sam Lee', contacts)).toBeNull();
    expect(matchContact('Pat Kim', contacts)).toBeNull();
    expect(matchContact('', contacts)).toBeNull();
  });
});

describe('publicName', () => {
  it('shows first name and last initial', () => {
    expect(publicName('Jane Q. Smith')).toBe('Jane S.');
    expect(publicName('Jane')).toBe('Jane');
    expect(publicName('  ')).toBe('A Google reviewer');
  });
});
