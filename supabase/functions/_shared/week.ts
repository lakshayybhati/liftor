/**
 * Shared week-cycle utilities for Supabase Edge Functions (Deno runtime).
 * Mirrors `utils/weekCycle.ts` used on the client.
 */

type DateTimePart = Intl.DateTimeFormatPart;

function getNumber(parts: DateTimePart[], type: DateTimePart['type']): number {
  const match = parts.find((part) => part.type === type);
  return match ? parseInt(match.value, 10) : 0;
}

function getDateInTimezone(date: Date, timezone?: string): Date {
  if (!timezone) {
    return new Date(date);
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const year = getNumber(parts, 'year');
  const month = getNumber(parts, 'month') - 1;
  const day = getNumber(parts, 'day');
  const hour = getNumber(parts, 'hour');
  const minute = getNumber(parts, 'minute');
  const second = getNumber(parts, 'second');

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

export function getWeekStartDate(date: Date = new Date(), timezone?: string): string {
  const zoned = getDateInTimezone(date, timezone);
  const day = zoned.getUTCDay();
  const offset = (day + 6) % 7;

  const start = new Date(zoned);
  start.setUTCDate(start.getUTCDate() - offset);
  start.setUTCHours(0, 0, 0, 0);

  return start.toISOString().split('T')[0];
}



