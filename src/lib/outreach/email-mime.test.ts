import { describe, expect, it } from 'vitest';
import {
  bracketMessageId,
  buildMime,
  encodeHeaderText,
  encodeQuotedPrintable,
  formatAddress,
  rfc2822Date,
  toGmailRaw,
} from './email-mime';

/** Undo quoted-printable, for round-trip checks. */
function decodeQp(s: string): string {
  const joined = s.replace(/=\r\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=' && /^[0-9A-F]{2}$/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8').replace(/\r\n/g, '\n');
}

const base = {
  from: { name: 'LuxWeb Studio', email: 'owner@studio.test' },
  to: 'info@shop.test',
  subject: "The phone number on Pop's website",
  html: '<div dir="ltr"><p>Good morning Sam,</p></div>',
  text: 'Good morning Sam,',
  messageId: '<abc-123@studio.test>',
  date: new Date('2026-11-23T14:05:09Z'),
  timeZone: 'America/New_York',
  boundary: 'b1',
};

describe('encodeQuotedPrintable', () => {
  it('keeps plain ASCII, encodes = and non-ASCII as UTF-8 bytes', () => {
    expect(encodeQuotedPrintable('a=b')).toBe('a=3Db');
    expect(encodeQuotedPrintable('(555) 555-0100 · site')).toBe('(555) 555-0100 =C2=B7 site');
  });

  it('encodes a space or tab at the end of a line only', () => {
    expect(encodeQuotedPrintable('one two \nthree\t')).toBe('one two=20\r\nthree=09');
  });

  it('soft-wraps long lines at 76 without splitting an escape, and round-trips', () => {
    const long = `${'x'.repeat(74)}·${'y'.repeat(200)} — “quoted” ${'z'.repeat(90)}`;
    const qp = encodeQuotedPrintable(long);
    for (const line of qp.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76);
    expect(qp).not.toMatch(/=[0-9A-F]?=\r\n/);
    expect(decodeQp(qp)).toBe(long);
  });

  it('round-trips multi-line HTML', () => {
    const html = '<p>Line one</p>\n<p>Ünïcödé and a = sign</p>\n';
    expect(decodeQp(encodeQuotedPrintable(html))).toBe(html);
  });
});

describe('headers', () => {
  it('leaves ASCII subjects alone and B-encodes the rest', () => {
    expect(encodeHeaderText('The quote form on your website')).toBe('The quote form on your website');
    const enc = encodeHeaderText('Café hours');
    expect(enc).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(Buffer.from(enc.slice(10, -2), 'base64').toString('utf8')).toBe('Café hours');
  });

  it('formats addresses, quoting names with specials', () => {
    expect(formatAddress('LuxWeb Studio', 'a@b.test')).toBe('LuxWeb Studio <a@b.test>');
    expect(formatAddress('Smith, Jo', 'a@b.test')).toBe('"Smith, Jo" <a@b.test>');
  });

  it('writes the date in the given time zone', () => {
    expect(rfc2822Date(new Date('2026-11-23T14:05:09Z'), 'America/New_York')).toBe(
      'Mon, 23 Nov 2026 09:05:09 -0500',
    );
    expect(rfc2822Date(new Date('2026-07-01T16:00:00Z'), 'America/New_York')).toBe(
      'Wed, 1 Jul 2026 12:00:00 -0400',
    );
  });

  it('brackets message ids exactly once', () => {
    expect(bracketMessageId('abc@x.test')).toBe('<abc@x.test>');
    expect(bracketMessageId('<abc@x.test>')).toBe('<abc@x.test>');
  });
});

describe('buildMime', () => {
  it('builds a first email: no reply headers, both parts', () => {
    const mime = buildMime(base);
    const [head, body] = mime.split('\r\n\r\n');
    expect(head).toContain('Message-ID: <abc-123@studio.test>');
    expect(head).toContain("Subject: The phone number on Pop's website");
    expect(head).toContain('From: LuxWeb Studio <owner@studio.test>');
    expect(head).toContain('To: info@shop.test');
    expect(head).toContain('Date: Mon, 23 Nov 2026 09:05:09 -0500');
    expect(head).toContain('Content-Type: multipart/alternative; boundary="b1"');
    expect(head).not.toContain('In-Reply-To');
    expect(body.startsWith('--b1\r\nContent-Type: text/plain')).toBe(true);
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).toContain('<div dir=3D"ltr">');
    expect(mime.trimEnd().endsWith('--b1--')).toBe(true);
  });

  it('threads a reply with In-Reply-To and References', () => {
    const mime = buildMime({
      ...base,
      subject: 'Re: Hi',
      inReplyTo: 'first@studio.test',
      references: '<first@studio.test>',
    });
    expect(mime).toContain('In-Reply-To: <first@studio.test>');
    expect(mime).toContain('References: <first@studio.test>');
  });

  it('refuses a line break in any header value', () => {
    expect(() => buildMime({ ...base, subject: 'Hi\r\nBcc: x@evil.test' })).toThrow(/line break/);
    expect(() => buildMime({ ...base, to: 'a@b.test\nBcc: x@evil.test' })).toThrow(/line break/);
  });

  it('encodes as base64url for Gmail', () => {
    const raw = toGmailRaw(buildMime(base));
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toContain('Message-ID: <abc-123@studio.test>');
  });
});
