/**
 * Shared formatters — one source of truth for currency, dates, and relative time.
 *
 * All monetary values in the CRM are stored as integer cents. `formatUSD`
 * takes cents and returns `$1,234` (no fractional digits — the CRM doesn't
 * deal in sub-dollar amounts).
 */

// Two formatters so we can render whole-dollar amounts cleanly ($5,000)
// while still showing cents when the value isn't a whole dollar ($1.50,
// $0.75). Defaulting to no decimals would lie about milestone splits
// that don't divide evenly.
const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const USD_CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_SHORT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const DATE_LONG = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const DATETIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const DATETIME_TZ = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

const DATETIME_LONG_TZ = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const DATETIME_COMPACT_TZ = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatUSD(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  return cents % 100 === 0
    ? USD_WHOLE.format(dollars)
    : USD_CENTS.format(dollars);
}

/**
 * Parse a formatter input into a Date for *calendar-date* display. A bare
 * "YYYY-MM-DD" string is interpreted by the JS engine as UTC midnight, which
 * then renders as the day before in any timezone behind UTC (e.g. a proposal
 * prepared 2026-05-30 showed as May 29). Build it as a local date instead so
 * a date-only value shows the same day everywhere. Full timestamps (anything
 * with a time component) are parsed as-is so their local time is preserved.
 */
function parseDisplayDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(input);
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATE_SHORT.format(parseDisplayDate(input));
}

export function formatDateLong(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATE_LONG.format(parseDisplayDate(input));
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATETIME.format(new Date(input));
}

export function formatDateTimeWithTz(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATETIME_TZ.format(new Date(input));
}

export function formatDateTimeCompactTz(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATETIME_COMPACT_TZ.format(new Date(input));
}

export function formatDateTimeLongTz(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATETIME_LONG_TZ.format(new Date(input));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

export function formatRelative(input: string | Date): string {
  const ms = new Date(input).getTime() - Date.now();
  const sec = Math.round(ms / 1000);
  for (const [unit, secs] of UNITS) {
    if (Math.abs(sec) >= secs || unit === 'second') {
      return RELATIVE.format(Math.round(sec / secs), unit);
    }
  }
  return '';
}
