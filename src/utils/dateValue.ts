/**
 * Reading and showing the date values held in records.
 *
 * Dates are stored as text: `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss]` when the
 * source carried a time. Three faults came from handing those strings to the
 * Date constructor:
 *
 *  - a bare `YYYY-MM-DD` is UTC midnight, so west of UTC it printed as the day
 *    before and compared as earlier than a time on the same day;
 *  - anything else is parsed by the browser's own rules, which read
 *    `03/04/2025` month-first whatever the file meant, and differ by browser
 *    for `2025-03-04 10:30`;
 *  - a time-zone offset moved the value to the viewer's clock, so the same
 *    record showed different dates in different countries.
 *
 * Everything here works on the calendar fields as written. A value that is not
 * in the stored format is reported as unreadable rather than guessed at.
 *
 * Imports no longer store an offset (they keep the time as written), but
 * datasets saved earlier can hold one. Those are still converted to the
 * viewer's clock, as they always were, so their dates do not move.
 */
import type { DateFormat } from '../contexts/LocaleContext';

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** False for a date with no time of day. */
  hasTime: boolean;
}

const STORED_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

function fromDate(value: Date): DateParts {
  return {
    year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(),
    hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds(),
    hasTime: value.getHours() + value.getMinutes() + value.getSeconds() > 0,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** True when the fields name a real calendar day and a real time. */
export function isValidDateParts(p: Omit<DateParts, 'hasTime'>): boolean {
  return (
    p.month >= 1 && p.month <= 12 &&
    p.day >= 1 && p.day <= daysInMonth(p.year, p.month) &&
    p.hour >= 0 && p.hour <= 23 &&
    p.minute >= 0 && p.minute <= 59 &&
    p.second >= 0 && p.second <= 59
  );
}

/**
 * Read a stored date. Returns null for anything that is not in the stored
 * format, including an impossible date such as 2025-02-31.
 */
export function parseStoredDate(value: unknown): DateParts | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : fromDate(value);
  }
  const text = String(value).trim();
  const match = STORED_DATE.exec(text);
  if (!match) return null;
  if (match[7] && match[4] !== undefined) {
    // An instant with an offset, from a dataset saved by an earlier version.
    const instant = new Date(text.replace(' ', 'T'));
    if (isNaN(instant.getTime())) return null;
    return { ...fromDate(instant), hasTime: true };
  }
  const parts: DateParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: match[4] ? Number(match[4]) : 0,
    minute: match[5] ? Number(match[5]) : 0,
    second: match[6] ? Number(match[6]) : 0,
    hasTime: match[4] !== undefined,
  };
  return isValidDateParts(parts) ? parts : null;
}

/** Days since 1970-01-01, counted on the calendar so no time zone enters. */
export function dayNumber(p: DateParts): number {
  return Math.round(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
}

/**
 * A number that orders dates and times as written, in seconds.
 */
export function comparableTime(p: DateParts): number {
  return dayNumber(p) * 86400 + p.hour * 3600 + p.minute * 60 + p.second;
}

/** Today's calendar day, in the same count as dayNumber. */
export function todayDayNumber(now: Date = new Date()): number {
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The stored form of a set of date fields. */
export function toStoredDate(p: DateParts): string {
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  if (!p.hasTime) return date;
  const time = `${pad(p.hour)}:${pad(p.minute)}${p.second ? `:${pad(p.second)}` : ''}`;
  return `${date}T${time}`;
}

/** Date fields in the order the user chose under Number & Date Format. */
export function formatDateParts(p: DateParts, dateFormat: DateFormat): string {
  const y = pad(p.year, 4), m = pad(p.month), d = pad(p.day);
  const date =
    dateFormat === 'MM/DD/YYYY' ? `${m}/${d}/${y}` :
    dateFormat === 'YYYY-MM-DD' ? `${y}-${m}-${d}` :
    `${d}/${m}/${y}`;
  if (!p.hasTime) return date;
  return `${date} ${pad(p.hour)}:${pad(p.minute)}${p.second ? `:${pad(p.second)}` : ''}`;
}

/**
 * A stored date as the user asked to see it. A value that cannot be read as a
 * date is shown exactly as it is stored, so a bad cell is visible as itself
 * instead of as "Invalid Date" or as a different day.
 */
export function formatStoredDate(value: unknown, dateFormat: DateFormat): string {
  if (value === null || value === undefined) return '';
  const parts = parseStoredDate(value);
  return parts ? formatDateParts(parts, dateFormat) : String(value);
}
