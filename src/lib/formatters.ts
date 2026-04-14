/**
 * Shared formatters — one source of truth for currency, dates, and relative time.
 *
 * All monetary values in the CRM are stored as integer cents. `formatUSD`
 * takes cents and returns `$1,234` (no fractional digits — the CRM doesn't
 * deal in sub-dollar amounts).
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
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
  return USD.format(cents / 100);
}

export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATE_SHORT.format(new Date(input));
}

export function formatDateLong(input: string | Date | null | undefined): string {
  if (!input) return '—';
  return DATE_LONG.format(new Date(input));
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

export function formatHours(hours: number, digits = 2): string {
  return hours.toFixed(digits);
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
