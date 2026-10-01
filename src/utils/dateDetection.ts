/**
 * Reading dates out of imported text.
 *
 * A date written as numbers does not say which number is the day. 03/04/2025
 * is 3 April in most of the world and 4 March in the United States, and a file
 * gives no other signal unless some value in the column has a day above 12.
 *
 * Three rules follow, each from a fault this module used to have:
 *
 *  - Look at every value. The first ten rows of a file sorted by date are the
 *    first twelve days of a month, which prove nothing, while row 13 settles it.
 *  - Match the whole value. A pattern that only anchored the start read
 *    "12/08/2024 (approx)" as a clean date and dropped the qualifier, and read
 *    household codes like 03-12-05 as dates.
 *  - Never fall back to the Date constructor, which reads month-first.
 *
 * When a column really is ambiguous the import dialog asks; nothing here
 * guesses.
 */
import { isValidDateParts, toStoredDate } from './dateValue';
import type { DateParts } from './dateValue';

/** Which of the two leading numbers is the day. */
export type DateOrder = 'DMY' | 'MDY';

/** What the user can answer when asked about an ambiguous column. */
export type DateChoice = DateOrder | 'text';

export interface ParsedDate {
  /** Stored form: YYYY-MM-DD, or YYYY-MM-DDTHH:mm[:ss] when there was a time. */
  iso: string;
  hasTime: boolean;
  /** The source carried a UTC offset, which is dropped (see dateValue.ts). */
  hadOffset: boolean;
  /** The year was written with two digits and had its century supplied. */
  twoDigitYear: boolean;
}

/**
 * How one value can be read.
 *  - fixed: only one reading exists (year first, or a month written as a word).
 *  - order: day and month are both numbers; either or both readings may be
 *    real calendar dates.
 */
export type DateReading =
  | { kind: 'fixed'; value: ParsedDate }
  | { kind: 'order'; dmy: ParsedDate | null; mdy: ParsedDate | null; separator: string };

const TIME = String.raw`(?:(?:[T ]|,\s?)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*([AaPp])?\.?(?:[Mm]\.?)?)?`;
const OFFSET = String.raw`\s*(Z|[+-]\d{2}:?\d{2})?`;

// The same separator must be used twice (\2), so "12/08-90" is not a date.
const NUMERIC_DATE = new RegExp(String.raw`^(\d{1,4})([-/.])(\d{1,2})\2(\d{1,4})${TIME}${OFFSET}$`);
// 4 March 2025, 04-Mar-2025, 04Mar2025, 4 mars 2025
const DAY_MONTHNAME = new RegExp(String.raw`^(\d{1,2})[\s\-/.]*([A-Za-z\u00c0-\u00ff]{3,10})\.?[\s\-/.,]*(\d{4}|\d{2})${TIME}$`);
// March 4, 2025
const MONTHNAME_DAY = new RegExp(String.raw`^([A-Za-z\u00c0-\u00ff]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${TIME}$`);

// English, French, Spanish and Portuguese, full names and the usual
// abbreviations, with accents removed. No abbreviation names two months.
const MONTH_NAMES: Record<string, number> = {};
[
  ['january', 'jan', 'janvier', 'janv', 'enero', 'ene', 'janeiro'],
  ['february', 'feb', 'fevrier', 'fevr', 'fev', 'febrero', 'fevereiro'],
  ['march', 'mar', 'mars', 'marzo', 'marco'],
  ['april', 'apr', 'avril', 'avr', 'abril', 'abr'],
  ['may', 'mai', 'mayo', 'maio'],
  ['june', 'jun', 'juin', 'junio', 'junho'],
  ['july', 'jul', 'juillet', 'juil', 'julio', 'julho'],
  ['august', 'aug', 'aout', 'agosto', 'ago'],
  ['september', 'sep', 'sept', 'septembre', 'septiembre', 'setiembre', 'setembro', 'set'],
  ['october', 'oct', 'octobre', 'octubre', 'outubro', 'out'],
  ['november', 'nov', 'novembre', 'noviembre', 'novembro'],
  ['december', 'dec', 'decembre', 'diciembre', 'dic', 'dezembro', 'dez'],
].forEach((names, index) => names.forEach(name => { MONTH_NAMES[name] = index + 1; }));

function monthFromName(name: string): number | null {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return MONTH_NAMES[key] ?? null;
}

/**
 * Supply the century for a two-digit year.
 *
 * A line list records things that have happened, so the reading that lands in
 * a future year is the wrong one: 15/06/29 in a date-of-birth column is 1929,
 * not 2029. Excel's fixed pivot (00-29 is 2000s) gets that case wrong.
 */
export function expandTwoDigitYear(year: number, now: Date = new Date()): number {
  const recent = 2000 + year;
  return recent > now.getFullYear() ? 1900 + year : recent;
}

interface TimeFields { hour: number; minute: number; second: number; hasTime: boolean }

function readTime(hour?: string, minute?: string, second?: string, meridiem?: string): TimeFields | null {
  if (hour === undefined) return { hour: 0, minute: 0, second: 0, hasTime: false };
  let h = Number(hour);
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    const pm = meridiem.toLowerCase() === 'p';
    h = (h % 12) + (pm ? 12 : 0);
  }
  return { hour: h, minute: Number(minute), second: second ? Number(second) : 0, hasTime: true };
}

function build(
  year: number, month: number, day: number, time: TimeFields,
  hadOffset: boolean, twoDigitYear: boolean
): ParsedDate | null {
  const parts: DateParts = { year, month, day, ...time };
  if (!isValidDateParts(parts)) return null;
  return { iso: toStoredDate(parts), hasTime: time.hasTime, hadOffset, twoDigitYear };
}

/**
 * Every way a value can be read as a date, or null when it is not one.
 * The whole value must be a date; trailing text disqualifies it.
 */
export function readDateValue(raw: string, now: Date = new Date()): DateReading | null {
  const value = raw.trim();
  if (!value) return null;

  const numeric = NUMERIC_DATE.exec(value);
  if (numeric) {
    const [, a, separator, b, c, hh, mm, ss, meridiem, offset] = numeric;
    const time = readTime(hh, mm, ss, meridiem);
    if (!time) return null;
    const hadOffset = offset !== undefined;

    if (a.length === 4) {
      // Year first is never ambiguous.
      if (c.length > 2) return null;
      const parsed = build(Number(a), Number(b), Number(c), time, hadOffset, false);
      return parsed ? { kind: 'fixed', value: parsed } : null;
    }
    if (a.length > 2) return null;

    // A two-digit year is accepted after a slash or a dot. With dashes,
    // three two-digit groups are as likely to be a cluster-household-member
    // code (03-12-05) as a date, so those are left as text.
    const twoDigitYear = c.length === 2;
    if (c.length !== 4 && !(twoDigitYear && separator !== '-')) return null;
    const year = twoDigitYear ? expandTwoDigitYear(Number(c), now) : Number(c);

    const dmy = build(year, Number(b), Number(a), time, hadOffset, twoDigitYear);
    const mdy = build(year, Number(a), Number(b), time, hadOffset, twoDigitYear);
    if (!dmy && !mdy) return null;
    // 05/05/2025 is the same day either way.
    if (dmy && mdy && dmy.iso === mdy.iso) return { kind: 'fixed', value: dmy };
    return { kind: 'order', dmy, mdy, separator };
  }

  const dayFirst = DAY_MONTHNAME.exec(value);
  if (dayFirst) {
    const [, d, name, y, hh, mm, ss, meridiem] = dayFirst;
    const month = monthFromName(name);
    const time = readTime(hh, mm, ss, meridiem);
    if (!month || !time) return null;
    const twoDigitYear = y.length === 2;
    const year = twoDigitYear ? expandTwoDigitYear(Number(y), now) : Number(y);
    const parsed = build(year, month, Number(d), time, false, twoDigitYear);
    return parsed ? { kind: 'fixed', value: parsed } : null;
  }

  const monthFirst = MONTHNAME_DAY.exec(value);
  if (monthFirst) {
    const [, name, d, y, hh, mm, ss, meridiem] = monthFirst;
    const month = monthFromName(name);
    const time = readTime(hh, mm, ss, meridiem);
    if (!month || !time) return null;
    const parsed = build(Number(y), month, Number(d), time, false, false);
    return parsed ? { kind: 'fixed', value: parsed } : null;
  }

  return null;
}

/**
 * What a whole column says about day/month order.
 *  - none:      no value depends on the order
 *  - DMY / MDY: at least one value is only a real date in that order, and none
 *               contradicts it
 *  - ambiguous: every value works both ways
 *  - mixed:     some values are only day-first and others only month-first
 */
export type ColumnDateOrder = 'none' | DateOrder | 'ambiguous' | 'mixed';

export interface DateValuesSummary {
  /** Values that can be read as a date in at least one way. */
  dateCount: number;
  order: ColumnDateOrder;
  /** Values that are a date under both orders, and a different date in each. */
  ambiguousCount: number;
  /** A few of those, for showing to the user. */
  ambiguousExamples: string[];
  /** The separator the day/month values use, when they agree on one. */
  separator: string | null;
}

/** Summarise how the values of one column read as dates. */
export function summarizeDateValues(values: string[], now: Date = new Date()): DateValuesSummary {
  let dateCount = 0, dmyOnly = 0, mdyOnly = 0, ambiguousCount = 0;
  const ambiguousExamples: string[] = [];
  const separators = new Set<string>();

  for (const value of values) {
    const reading = readDateValue(value, now);
    if (!reading) continue;
    dateCount++;
    if (reading.kind !== 'order') continue;
    separators.add(reading.separator);
    if (reading.dmy && reading.mdy) {
      ambiguousCount++;
      if (ambiguousExamples.length < 3 && !ambiguousExamples.includes(value.trim())) {
        ambiguousExamples.push(value.trim());
      }
    } else if (reading.dmy) {
      dmyOnly++;
    } else {
      mdyOnly++;
    }
  }

  const order: ColumnDateOrder =
    dmyOnly > 0 && mdyOnly > 0 ? 'mixed' :
    dmyOnly > 0 ? 'DMY' :
    mdyOnly > 0 ? 'MDY' :
    ambiguousCount > 0 ? 'ambiguous' : 'none';

  return {
    dateCount,
    order,
    ambiguousCount,
    ambiguousExamples,
    separator: separators.size === 1 ? [...separators][0] : null,
  };
}

/**
 * Convert one value, given the order to use where the value itself does not
 * settle it. A value that is only a real date one way is read that way
 * whatever the column order, so 25/03/2025 in a month-first column is still
 * 25 March rather than a failure. Returns null when the value is not a date,
 * or is ambiguous and no order was given.
 */
export function convertDateValue(
  raw: string,
  order: DateOrder | null,
  now: Date = new Date()
): ParsedDate | null {
  const reading = readDateValue(raw, now);
  if (!reading) return null;
  if (reading.kind === 'fixed') return reading.value;
  if (reading.dmy && reading.mdy) {
    return order === 'DMY' ? reading.dmy : order === 'MDY' ? reading.mdy : null;
  }
  return reading.dmy ?? reading.mdy;
}

/** A date in words, for showing what a choice would mean: "3 April 2025". */
export function describeIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}
