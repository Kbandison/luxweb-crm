/**
 * A plain RFC 5322 message for Gmail's `messages.send`: a text and an HTML
 * part, quoted-printable, the way Gmail web builds one. Pure, so the encoding
 * and the header rules are tested without a network.
 */

export type MimeInput = {
  from: { name: string; email: string };
  to: string;
  subject: string;
  html: string;
  text: string;
  /** With angle brackets, e.g. "<abc@luxwebstudio.dev>". */
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  date: Date;
  timeZone: string;
  /** Fixed in tests; random otherwise. */
  boundary?: string;
};

const CRLF = '\r\n';

/** A header value can't carry a line break — that would let it add headers. */
function headerSafe(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`${name} can't contain a line break`);
  return value;
}

/** RFC 2047 encoded-words for a header with non-ASCII text; ASCII passes through. */
export function encodeHeaderText(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = '';
  for (const ch of value) {
    // ~45 bytes of UTF-8 per word keeps each encoded word under 75 chars.
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words
    .map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`)
    .join(`${CRLF} `);
}

/** "LuxWeb Studio <kevin@example.com>", quoting or encoding the name when it needs it. */
export function formatAddress(name: string, email: string): string {
  if (!/^[\x20-\x7e]*$/.test(name)) return `${encodeHeaderText(name)} <${email}>`;
  if (/^[A-Za-z0-9 !#$%&'*+\-/=?^_`{|}~]*$/.test(name)) return `${name} <${email}>`;
  return `"${name.replace(/["\\]/g, '\\$&')}" <${email}>`;
}

/**
 * Quoted-printable (RFC 2045): printable ASCII stays as is, everything else is
 * =XX of its UTF-8 bytes, a space or tab at a line's end is encoded, and lines
 * are soft-wrapped at 76 characters without splitting an =XX.
 */
export function encodeQuotedPrintable(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const bytes = Buffer.from(line, 'utf8');
    const tokens: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      const literal = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last);
      tokens.push(literal ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`);
    }
    let current = '';
    for (const t of tokens) {
      if (current.length + t.length > 75) {
        out.push(`${current}=`);
        current = '';
      }
      current += t;
    }
    out.push(current);
  }
  return out.join(CRLF);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The wall-clock parts of `date` in `timeZone`, plus that zone's UTC offset in minutes. */
export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const get = (type: string) =>
    Number(fmt.formatToParts(date).find((p) => p.type === type)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, offsetMin, weekday };
}

/** "Mon, 23 Nov 2026 09:00:00 -0500" in `timeZone`. */
export function rfc2822Date(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const sign = p.offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(p.offsetMin);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${DAYS[p.weekday]}, ${p.day} ${MONTHS[p.month - 1]} ${p.year} ${two(p.hour)}:${two(p.minute)}:${two(p.second)} ${sign}${two(Math.floor(abs / 60))}${two(abs % 60)}`;
}

/** Message-IDs always travel in angle brackets. */
export function bracketMessageId(id: string): string {
  const bare = id.trim().replace(/^<|>$/g, '');
  return `<${bare}>`;
}

export function buildMime(m: MimeInput): string {
  // Check what callers hand us before encoding: an encoded subject folds
  // onto a second line on purpose, a raw value never may.
  headerSafe('Subject', m.subject);
  headerSafe('From', `${m.from.name} ${m.from.email}`);
  headerSafe('To', m.to);
  headerSafe('Message-ID', m.messageId);
  headerSafe('In-Reply-To', m.inReplyTo ?? '');
  headerSafe('References', m.references ?? '');

  const boundary = m.boundary ?? `lw_${crypto.randomUUID().replace(/-/g, '')}`;
  const headers: [string, string][] = [
    ['MIME-Version', '1.0'],
    ['Date', rfc2822Date(m.date, m.timeZone)],
    ['Message-ID', bracketMessageId(m.messageId)],
  ];
  if (m.inReplyTo) {
    headers.push(['In-Reply-To', bracketMessageId(m.inReplyTo)]);
    headers.push(['References', (m.references || bracketMessageId(m.inReplyTo)).trim()]);
  }
  headers.push(
    ['Subject', encodeHeaderText(m.subject)],
    ['From', formatAddress(m.from.name, m.from.email)],
    ['To', m.to],
    ['Content-Type', `multipart/alternative; boundary="${boundary}"`],
  );

  const head = headers.map(([k, v]) => `${k}: ${v}`).join(CRLF);
  const part = (type: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      'Content-Transfer-Encoding: quoted-printable',
      '',
      encodeQuotedPrintable(body),
    ].join(CRLF);

  return [head, '', part('text/plain', m.text), part('text/html', m.html), `--${boundary}--`, ''].join(CRLF);
}

/** Gmail's `raw` field: the whole message, base64url. */
export function toGmailRaw(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64url');
}
