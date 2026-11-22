import { zonedParts } from '@/lib/outreach/email-mime';

/**
 * The parts of an outreach email the CRM adds around the body it's given:
 * the reply quote (shaped like Gmail web's, so the reader's mail app folds
 * it the same way), the HTML wrapper, and the plain-text twin of the HTML.
 * Pure functions.
 */

export type Earlier = {
  html: string;
  sentAt: Date;
  fromName: string;
  fromEmail: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Tue, Nov 10, 2026 at 4:14 PM", the way Gmail writes a reply's "On ... wrote:". */
export function attributionDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour < 12 ? 'AM' : 'PM';
  const mm = String(p.minute).padStart(2, '0');
  return `${DAYS[p.weekday]}, ${MONTHS[p.month - 1]} ${p.day}, ${p.year} at ${h12}:${mm} ${ampm}`;
}

/** The earlier email under an "On ... wrote:" line, in Gmail's quote markup. */
export function quoteHtml(earlier: Earlier, timeZone: string): string {
  const email = escapeHtml(earlier.fromEmail);
  return (
    '<div class="gmail_quote"><div dir="ltr" class="gmail_attr">' +
    `On ${attributionDate(earlier.sentAt, timeZone)} ${escapeHtml(earlier.fromName)} ` +
    `&lt;<a href="mailto:${email}">${email}</a>&gt; wrote:<br></div>` +
    '<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">' +
    earlier.html +
    '</blockquote></div>'
  );
}

/** The whole HTML that goes out: the body, then the quote when it's a reply. */
export function composeHtml(bodyHtml: string, quote: string | null): string {
  return `<div dir="ltr">${bodyHtml}</div>${quote ? `<br>${quote}` : ''}`;
}

/** "Re: <subject>", without stacking a second "Re:". */
export function replySubject(subject: string): string {
  return `Re: ${subject.replace(/^(\s*re:\s*)+/i, '').trim()}`;
}

// Stand-ins for "<" and ">" in text we produce, so stripping tags can't eat
// a link's "<https://…>".
const LT = '\u0001';
const GT = '\u0002';

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function linkText(href: string, inner: string): string {
  const text = inner.replace(/<[^>]*>/g, '');
  const plain = decodeEntities(text).trim();
  const url = decodeEntities(href).trim();
  if (/^(mailto|tel):/i.test(url)) return text;
  if (plain === url || `${plain}/` === url || plain === `${url}/`) return `${LT}${url}${GT}`;
  return `${text} ${LT}${url}${GT}`;
}

/** Text for HTML with no blockquote left in it. */
function flatToText(html: string): string {
  const s = html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, href: string, inner: string) =>
      linkText(href, inner),
    )
    .replace(/<\/?(b|strong)\b[^>]*>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6])>/gi, '\n\n')
    .replace(/<\/(div|li|tr|ul|ol)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(s)
    .replace(new RegExp(LT, 'g'), '<')
    .replace(new RegExp(GT, 'g'), '>')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The text/plain twin of an email's HTML: paragraphs as blank lines, links as
 * "text <url>", bold as *text*, and each quoted email under "> ", nested the
 * way Gmail nests them.
 */
export function htmlToText(html: string): string {
  const quoted: string[] = [];
  const token = (i: number) => `\u0003Q${i}\u0003`;
  const resolve = (s: string) =>
    s.replace(/\u0003Q(\d+)\u0003/g, (_, i: string) => quoted[Number(i)]);

  // Innermost quote first, so each level is plain text before its parent
  // prefixes it.
  const innermost = /<blockquote\b[^>]*>((?:(?!<blockquote\b)[\s\S])*?)<\/blockquote>/i;
  let rest = html;
  for (let m = innermost.exec(rest); m; m = innermost.exec(rest)) {
    const inner = resolve(flatToText(m[1]));
    quoted.push(inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'));
    rest = rest.slice(0, m.index) + `<br>${token(quoted.length - 1)}<br>` + rest.slice(m.index + m[0].length);
  }
  return resolve(flatToText(rest)).replace(/\n{3,}/g, '\n\n');
}
