/**
 * A calendar date (YYYY-MM-DD) as a paid_at timestamp. Stamped at noon UTC so
 * the day survives being read back in Eastern time — midnight UTC renders as
 * the previous day in the P&L and on the client's receipt.
 */
export function paidAtForDate(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toISOString();
}
