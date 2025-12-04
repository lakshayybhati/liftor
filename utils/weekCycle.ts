/**
 * Week Cycle Helpers
 *
 * Provides utilities to compute the canonical week start date (Monday) for
 * enforcing single-week plan cycles across the app.
 *
 * NOTE: Server-side edge functions use a mirrored helper in
 * `supabase/functions/_shared/week.ts`. Keep both implementations in sync.
 */

type DateTimePart = Intl.DateTimeFormatPart;

function getNumber(parts: DateTimePart[], type: DateTimePart['type']): number {
  const match = parts.find((part) => part.type === type);
  return match ? parseInt(match.value, 10) : 0;
}

/**
 * Convert a JS Date into a UTC Date that represents the same moment in the
 * provided timezone. This allows consistent week calculations regardless of
 * the device locale.
 */
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
  const month = getNumber(parts, 'month') - 1; // JS months are 0-indexed
  const day = getNumber(parts, 'day');
  const hour = getNumber(parts, 'hour');
  const minute = getNumber(parts, 'minute');
  const second = getNumber(parts, 'second');

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday that starts the week
 * for the provided date/timezone combination.
 */
export function getWeekStartDate(date: Date = new Date(), timezone?: string): string {
  const zoned = getDateInTimezone(date, timezone);
  const day = zoned.getUTCDay();
  const offset = (day + 6) % 7; // Convert Sunday=0 to Monday=0 offset

  const start = new Date(zoned);
  start.setUTCDate(start.getUTCDate() - offset);
  start.setUTCHours(0, 0, 0, 0);

  return start.toISOString().split('T')[0];
}

/**
 * Convenience helper that returns a stable key for grouping plans by week.
 */
export function getWeekCycleKey(date: Date = new Date(), timezone?: string): string {
  return getWeekStartDate(date, timezone);
}

/**
 * Derive a week start date for an ISO timestamp (string), gracefully handling
 * invalid values by falling back to the current week.
 */
export function getWeekStartFromIso(isoDate?: string, timezone?: string): string {
  if (!isoDate) {
    return getWeekStartDate(new Date(), timezone);
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return getWeekStartDate(new Date(), timezone);
  }

  return getWeekStartDate(parsed, timezone);
}



