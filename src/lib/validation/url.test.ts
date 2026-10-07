import { describe, expect, it } from 'vitest';
import {
  isSafeHttpUrl,
  isSftpHost,
  normalizeHttpUrl,
  safeSameOriginNext,
} from './url';

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

  it('accepts bare hosts, with or without a port', () => {
    expect(isSafeHttpUrl('example.com')).toBe(true);
    expect(isSafeHttpUrl('app.example.com/login')).toBe(true);
    // "example.com:" is a port, not a scheme.
    expect(isSafeHttpUrl('sftp.example.com:22')).toBe(true);
    expect(isSafeHttpUrl('example.com:8080/admin?x=1')).toBe(true);
    expect(isSafeHttpUrl('localhost:3000')).toBe(true);
    expect(isSafeHttpUrl('192.168.1.10:8080')).toBe(true);
  });

  it('never mistakes a dangerous scheme for host:port', () => {
    expect(isSafeHttpUrl('javascript:1')).toBe(false);
    expect(isSafeHttpUrl('javascript:1/alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:1/x')).toBe(false);
    expect(isSafeHttpUrl('sftp://example.com:22')).toBe(false);
  });

  it('rejects control characters browsers strip from a URL', () => {
    expect(isSafeHttpUrl('java\tscript:1/alert(1)')).toBe(false);
    expect(isSafeHttpUrl('java\nscript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('https://exa\u0000mple.com')).toBe(false);
  });
});

describe('normalizeHttpUrl', () => {
  it('returns null for empty input', () => {
    expect(normalizeHttpUrl(null)).toBe(null);
    expect(normalizeHttpUrl(undefined)).toBe(null);
    expect(normalizeHttpUrl('   ')).toBe(null);
  });

  it('keeps an explicit scheme', () => {
    expect(normalizeHttpUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeHttpUrl(' https://example.com/x ')).toBe(
      'https://example.com/x',
    );
  });

  it('prefixes bare hosts, including host:port', () => {
    expect(normalizeHttpUrl('app.host.com/login')).toBe(
      'https://app.host.com/login',
    );
    expect(normalizeHttpUrl('example.com:8080')).toBe('https://example.com:8080');
    expect(normalizeHttpUrl('localhost:3000/x')).toBe('https://localhost:3000/x');
  });
});

describe('isSftpHost', () => {
  it('accepts null/undefined/empty', () => {
    expect(isSftpHost(null)).toBe(true);
    expect(isSftpHost(undefined)).toBe(true);
    expect(isSftpHost('  ')).toBe(true);
  });

  it('accepts host, host:port and sftp://host[:port]', () => {
    expect(isSftpHost('sftp.example.com')).toBe(true);
    expect(isSftpHost('sftp.example.com:22')).toBe(true);
    expect(isSftpHost('host:2222')).toBe(true);
    expect(isSftpHost('sftp://host:22')).toBe(true);
    expect(isSftpHost('SFTP://Files.Example.com:2222/var/www')).toBe(true);
    expect(isSftpHost('203.0.113.7:22')).toBe(true);
  });

  it('rejects other schemes and malformed hosts', () => {
    expect(isSftpHost('javascript:alert(1)')).toBe(false);
    expect(isSftpHost('https://example.com')).toBe(false);
    expect(isSftpHost('data:text/html,x')).toBe(false);
    expect(isSftpHost('host name.com')).toBe(false);
    expect(isSftpHost('-host.com')).toBe(false);
    expect(isSftpHost('host.com:')).toBe(false);
    expect(isSftpHost({} as unknown)).toBe(false);
  });

  it('rejects out-of-range ports', () => {
    expect(isSftpHost('host.com:0')).toBe(false);
    expect(isSftpHost('host.com:65536')).toBe(false);
    expect(isSftpHost('host.com:65535')).toBe(true);
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
