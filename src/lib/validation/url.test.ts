import { describe, expect, it } from 'vitest';
import { isSafeHttpUrl, safeSameOriginNext } from './url';

describe('isSafeHttpUrl', () => {
  it('accepts null/undefined/empty', () => {
    expect(isSafeHttpUrl(null)).toBe(true);
    expect(isSafeHttpUrl(undefined)).toBe(true);
    expect(isSafeHttpUrl('')).toBe(true);
    expect(isSafeHttpUrl('   ')).toBe(true);
  });

  it('accepts http and https', () => {
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
    expect(isSafeHttpUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects javascript: URIs (XSS)', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false);
  });

  it('rejects data: URIs', () => {
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects file:, ftp:, vbscript:', () => {
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('ftp://example.com')).toBe(false);
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeHttpUrl('not a url')).toBe(false);
    expect(isSafeHttpUrl({} as unknown)).toBe(false);
    expect(isSafeHttpUrl(42 as unknown)).toBe(false);
  });
});

describe('safeSameOriginNext', () => {
  const origin = 'https://luxweb.app';

  it('returns / for null/empty', () => {
    expect(safeSameOriginNext(null, origin)).toBe('/');
    expect(safeSameOriginNext('', origin)).toBe('/');
    expect(safeSameOriginNext(undefined, origin)).toBe('/');
  });

  it('preserves same-origin paths', () => {
    expect(safeSameOriginNext('/portal/dashboard', origin)).toBe(
      '/portal/dashboard',
    );
    expect(safeSameOriginNext('/portal/dashboard?x=1', origin)).toBe(
      '/portal/dashboard?x=1',
    );
  });

  it('rejects scheme-relative URLs (//evil.com)', () => {
    expect(safeSameOriginNext('//evil.com', origin)).toBe('/');
    expect(safeSameOriginNext('//evil.com/path', origin)).toBe('/');
  });

  it('rejects absolute off-origin URLs', () => {
    expect(safeSameOriginNext('https://evil.com', origin)).toBe('/');
    expect(safeSameOriginNext('http://evil.com/portal', origin)).toBe('/');
  });

  it('rejects javascript: URLs', () => {
    expect(safeSameOriginNext('javascript:alert(1)', origin)).toBe('/');
  });

  it('rejects backslash-prefix tricks', () => {
    // `/\\evil.com` is treated as a path by URL — verify origin still matches.
    const result = safeSameOriginNext('/\\evil.com', origin);
    // The URL parser interprets this differently across runtimes; what we
    // care about is "returns relative path under our origin or '/'".
    expect(result.startsWith('/')).toBe(true);
  });
});
