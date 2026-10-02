import type { CaseRecord } from '../types/analysis';
import { categoryValue, isMissingValue, sortCategoryValues, MISSING_CATEGORY_LABEL } from './recordFilter';
import { readsAsNonCase } from './caseDefinition';

export type BinSize = 'hourly' | '6hour' | '12hour' | 'daily' | 'weekly-cdc' | 'weekly-iso' | 'monthly';

export const BIN_SIZES: readonly BinSize[] = [
  'hourly', '6hour', '12hour', 'daily', 'weekly-cdc', 'weekly-iso', 'monthly',
] as const;

/**
 * Guard for values coming from storage or an imported project file, which are
 * otherwise cast straight to BinSize without being checked.
 */
export function isBinSize(value: unknown): value is BinSize {
  return typeof value === 'string' && (BIN_SIZES as readonly string[]).includes(value);
}

export function isSubDailyBinSize(binSize: BinSize): boolean {
  return binSize === 'hourly' || binSize === '6hour' || binSize === '12hour';
}

export type ColorScheme = 'default' | 'classification' | 'colorblind' | 'grayscale';

// ============ Reading dates and times ============
//
// Dates used to be handed to `new Date(text)`, which reads anything it does not
// recognise as ISO by US rules. "05/01/2026 10:00" in a day-first line list was
// drawn on May 1, "13/01/2026 08:00" was dropped as invalid, and a column of
// Excel serial numbers was drawn in the year 46033, all without a word. Only
// forms that can be read one way are accepted here; everything else is counted
// as unrecognised so the chart can say how many records it left out.

/** A date, and a time of day if one was written, with no timezone attached. */
export interface WallClock {
  year: number;
  /** 0-based, as in Date. */
  month: number;
  day: number;
  hours: number;
  minutes: number;
  /** False when only a date was written, so the time of day is unknown. */
  hasTime: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

function daysInMonth(year: number, month: number): number {
  if (month === 1) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
}

/**
 * Parses a time of day and returns hours and minutes, or null.
 *
 * Accepts "14:00", "14:30:00", "2:30 PM", "2 PM", "1430" and "14h30". Seconds
 * are read and dropped. A decimal such as "0.6" or "14.30" is not accepted: it
 * could be a clock time or a fraction of a day, and guessing puts the case in
 * the wrong bar.
 */
export function parseTimeString(timeStr: string | null | undefined): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;

  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  // 24-hour: "14:00", "9:00", "14:30:00", "14:30:00.000"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    const seconds = match24[3] ? parseInt(match24[3], 10) : 0;
    if (hours <= 23 && minutes <= 59 && seconds <= 59) return { hours, minutes };
    return null;
  }

  // 12-hour: "2:30 PM", "11:00 AM", "2:30:00 pm", "2 PM", "2pm", "2 p.m."
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*([ap])\.?\s?m\.?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const seconds = match12[3] ? parseInt(match12[3], 10) : 0;
    const isPM = match12[4].toUpperCase() === 'P';
    if (hours >= 1 && hours <= 12 && minutes <= 59 && seconds <= 59) {
      if (isPM && hours !== 12) hours += 12;
      if (!isPM && hours === 12) hours = 0;
      return { hours, minutes };
    }
    return null;
  }

  // "14h30", "14h", "14 h 30"
  const matchH = trimmed.match(/^(\d{1,2})\s?h\s?(\d{2})?$/i);
  if (matchH) {
    const hours = parseInt(matchH[1], 10);
    const minutes = matchH[2] ? parseInt(matchH[2], 10) : 0;
    if (hours <= 23 && minutes <= 59) return { hours, minutes };
    return null;
  }

  // Four digits with no separator: "1430", "0930"
  const matchCompact = trimmed.match(/^(\d{2})(\d{2})$/);
  if (matchCompact) {
    const hours = parseInt(matchCompact[1], 10);
    const minutes = parseInt(matchCompact[2], 10);
    if (hours <= 23 && minutes <= 59) return { hours, minutes };
  }

  return null;
}

/**
 * Reads a date, with a time if one is attached, exactly as written.
 *
 * Accepted: year-first numeric dates (2026-01-15, 2026/1/15), and dates that
 * spell the month (15 Jan 2026, 15-January-2026, Jan 15, 2026), each optionally
 * followed by a time. A timezone suffix is ignored and the clock time kept: an
 * onset recorded as 14:30 where the patient was should be drawn at 14:30
 * wherever the chart is opened.
 *
 * Numeric dates with the year last are refused whether or not the day exceeds
 * 12. Reading "13/01/2026" as day-first while leaving "05/01/2026" in the same
 * column unread would plot half an outbreak, so the whole form is left to the
 * importer, which asks which order the column uses.
 */
export function parseWallClock(value: unknown): WallClock | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const hours = value.getHours();
    const minutes = value.getMinutes();
    return {
      year: value.getFullYear(), month: value.getMonth(), day: value.getDate(),
      hours, minutes,
      hasTime: hours !== 0 || minutes !== 0,
    };
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  let year: number;
  let month: number;
  let day: number;
  let rest: string | undefined;

  let m = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:(?:T|\s+)(.+))?$/i.exec(text);
  if (m) {
    year = parseInt(m[1], 10);
    month = parseInt(m[3], 10) - 1;
    day = parseInt(m[4], 10);
    rest = m[5];
  } else if ((m = /^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})\.?[\s\-/.,]+(\d{4})(?:,?\s+(.+))?$/.exec(text))) {
    const named = MONTH_NAMES[m[2].toLowerCase()];
    if (named === undefined) return null;
    year = parseInt(m[3], 10);
    month = named;
    day = parseInt(m[1], 10);
    rest = m[4];
  } else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:,?\s+(.+))?$/i.exec(text))) {
    const named = MONTH_NAMES[m[1].toLowerCase()];
    if (named === undefined) return null;
    year = parseInt(m[3], 10);
    month = named;
    day = parseInt(m[2], 10);
    rest = m[4];
  } else {
    return null;
  }

  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;

  if (rest === undefined) {
    return { year, month, day, hours: 0, minutes: 0, hasTime: false };
  }

  // Drop a timezone suffix ("Z", "+03:00", "-0500") and keep the clock time.
  const time = parseTimeString(rest.replace(/\s*(?:Z|[+-]\d{2}(?::?\d{2})?)$/i, ''));
  // A date followed by something that is not a time is not a date we can read.
  if (!time) return null;
  return { year, month, day, hours: time.hours, minutes: time.minutes, hasTime: true };
}

/** A Date at these local clock values. Years below 100 are kept as written. */
function localDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0, ms = 0): Date {
  const d = new Date(year, month, day, hours, minutes, seconds, ms);
  if (year < 100) d.setFullYear(year);
  return d;
}

/**
 * Parse a date as local time (exported for use in components). Returns an
 * Invalid Date for anything parseWallClock does not accept.
 */
export function parseLocalDate(dateValue: string | Date): Date {
  if (dateValue instanceof Date) {
    return dateValue;
  }
  const w = parseWallClock(String(dateValue));
  if (!w) return new Date(NaN);
  return localDate(w.year, w.month, w.day, w.hours, w.minutes);
}

// ============ Timezone-free time ============
//
// Bins used to be built by stepping a local Date forward a day at a time. In a
// timezone whose clocks change at midnight (Egypt, Chile, Cuba, Lebanon, and
// Brazil before 2019) the changeover day has no 00:00, so that day's bin began
// at 01:00 and so did every bin after it. A case dated the next day, which is
// read as 00:00, then fell in the previous day's bar: every case after the
// changeover was drawn one day early.
//
// A line list has no timezone. "11 January, 14:30" means that clock reading
// where the patient was. So binning is done on the clock values alone, held as
// a number that counts milliseconds as if every day had 24 hours. The same
// records then land in the same bars in every timezone.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function clockKey(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0, ms = 0): number {
  const t = new Date(Date.UTC(2000, month, day, hours, minutes, seconds, ms));
  t.setUTCFullYear(year);
  return t.getTime();
}

function clockKeyOfDate(d: Date): number {
  return clockKey(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

/** The local Date showing these clock values. A missing local hour moves forward, as Date does. */
function clockKeyToLocal(key: number): Date {
  const u = new Date(key);
  return localDate(
    u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(),
    u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds()
  );
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by;
}

/** The width of a bin, for the sizes that have one. A month does not. */
function binStepMs(binSize: BinSize): number {
  switch (binSize) {
    case 'hourly': return HOUR_MS;
    case '6hour': return 6 * HOUR_MS;
    case '12hour': return 12 * HOUR_MS;
    case 'weekly-cdc':
    case 'weekly-iso': return WEEK_MS;
    default: return DAY_MS;
  }
}

/**
 * Which bar a moment falls in, as a whole number counted from a fixed origin.
 *
 * Bars are found and laid out by this number rather than by a width in
 * milliseconds, because months are not all the same length. Consecutive bars
 * have consecutive numbers, so the bar a record belongs in is a subtraction.
 */
function binOrdinal(key: number, binSize: BinSize): number {
  switch (binSize) {
    case 'monthly': {
      const u = new Date(key);
      return u.getUTCFullYear() * 12 + u.getUTCMonth();
    }
    // CDC (MMWR) weeks start on Sunday. Day 0 of the count was a Thursday.
    case 'weekly-cdc': return Math.floor((Math.floor(key / DAY_MS) + 4) / 7) - 1;
    // ISO weeks start on Monday.
    case 'weekly-iso': return Math.floor((Math.floor(key / DAY_MS) + 3) / 7) - 1;
    // The count starts at a midnight, so hourly sizes fall on 0:00, 6:00, 12:00...
    default: return Math.floor(key / binStepMs(binSize));
  }
}

/** The moment a numbered bar starts. */
function ordinalStartKey(ordinal: number, binSize: BinSize): number {
  switch (binSize) {
    case 'monthly': return clockKey(Math.floor(ordinal / 12), mod(ordinal, 12), 1);
    case 'weekly-cdc': return (ordinal * 7 + 3) * DAY_MS;
    case 'weekly-iso': return (ordinal * 7 + 4) * DAY_MS;
    default: return ordinal * binStepMs(binSize);
  }
}

function binStartKey(key: number, binSize: BinSize): number {
  return ordinalStartKey(binOrdinal(key, binSize), binSize);
}

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatBinLabel(key: number, binSize: BinSize, withYear = false): string {
  const u = new Date(key);
  if (binSize === 'monthly') {
    const month = MONTH_ABBREVIATIONS[u.getUTCMonth()];
    return withYear ? `${month} ${u.getUTCFullYear()}` : month;
  }
  const day = `${MONTH_ABBREVIATIONS[u.getUTCMonth()]} ${u.getUTCDate()}`;
  const dated = withYear ? `${day}, ${u.getUTCFullYear()}` : day;
  return isSubDailyBinSize(binSize) ? `${dated} ${u.getUTCHours()}:00` : dated;
}

export interface EpiCurveBin {
  startDate: Date;
  endDate: Date;
  /** startDate's clock values as a timezone-free number; see "Timezone-free time". */
  startKey: number;
  label: string;
  cases: CaseRecord[];
  strata: Map<string, CaseRecord[]>;
  /** Height of each stratum's segment: its records, or their counts added up. */
  strataTotals: Map<string, number>;
  /** Height of the bar. */
  total: number;
}

/** What was drawn, what was left out and why. The chart shows all of it. */
export interface EpiCurveSummary {
  /**
   * What the bars add up to: the number of records, or, with a count column,
   * the cases those records report.
   */
  plotted: number;
  /** Records that went into the bars. Equal to `plotted` without a count column. */
  plottedRecords: number;
  /** With a count column: records whose count is blank or not a whole number of zero or more. */
  missingCount: number;
  missingCountExamples: string[];
  /** Nothing in the date column. */
  missingDate: number;
  /** A value in the date column that could not be read as a date. */
  unrecognisedDate: number;
  unrecognisedDateExamples: string[];
  /** Hourly bins only: a date but nothing in the time column. */
  missingTime: number;
  /** Hourly bins only: a value in the time column that could not be read. */
  unrecognisedTime: number;
  unrecognisedTimeExamples: string[];
  /** Dated, but outside the custom date range. */
  outsideRange: number;
  firstOnset: Date | null;
  lastOnset: Date | null;
  /** True when first and last onset carry a real time of day. */
  onsetHasTime: boolean;
  /** Records dated far from the rest, usually a mistyped year. */
  outlierCount: number;
  outlierExamples: string[];
}

export interface EpiCurveData {
  bins: EpiCurveBin[];
  maxCount: number;
  strataKeys: string[];
  dateRange: { start: Date; end: Date };
  /** The bin size drawn, which is coarser than the one asked for when that needed too many bars. */
  binSize: BinSize;
  requestedBinSize: BinSize;
  /** Bars the requested size would have needed, when that was over the limit; otherwise 0. */
  requestedBinCount: number;
  /** True when even weekly bins were over the limit, so nothing was drawn. */
  tooManyBins: boolean;
  /** Index of the tallest bar (the first, on a tie), or -1. */
  peakBinIndex: number;
  summary: EpiCurveSummary;
}

/**
 * More bars than this cannot be read, and each one costs DOM nodes: one record
 * with a mistyped year (2016 for 2026) asked for 88,000 hourly bars and froze
 * the tab for 41 seconds. 1000 is 41 days of hours, 2.7 years of days or 19
 * years of weeks.
 */
export const MAX_EPI_CURVE_BINS = 1000;

/** The next coarser bin size to fall back to when a request needs too many bars. */
const COARSER_BIN_SIZE: Partial<Record<BinSize, BinSize>> = {
  hourly: '6hour',
  '6hour': '12hour',
  '12hour': 'daily',
  daily: 'weekly-cdc',
};

export interface EpiCurveOptions {
  /**
   * Draw exactly this span (the custom date range) instead of fitting the axis
   * to the data. Records outside it are counted in the summary, not plotted.
   */
  range?: { start: Date; end: Date };
  maxBins?: number;
  /**
   * A column saying how many cases each record stands for, for aggregated data
   * such as one row per district and month. Bars then add up that column
   * instead of counting rows.
   */
  countColumn?: string;
}

function emptySummary(): EpiCurveSummary {
  return {
    plotted: 0,
    plottedRecords: 0,
    missingCount: 0,
    missingCountExamples: [],
    missingDate: 0,
    unrecognisedDate: 0,
    unrecognisedDateExamples: [],
    missingTime: 0,
    unrecognisedTime: 0,
    unrecognisedTimeExamples: [],
    outsideRange: 0,
    firstOnset: null,
    lastOnset: null,
    onsetHasTime: false,
    outlierCount: 0,
    outlierExamples: [],
  };
}

export function emptyEpiCurveData(binSize: BinSize = 'daily'): EpiCurveData {
  return {
    bins: [],
    maxCount: 0,
    strataKeys: [],
    dateRange: { start: new Date(), end: new Date() },
    binSize,
    requestedBinSize: binSize,
    requestedBinCount: 0,
    tooManyBins: false,
    peakBinIndex: -1,
    summary: emptySummary(),
  };
}

function pushExample(examples: string[], value: unknown): void {
  const text = String(value).trim();
  if (examples.length < 3 && !examples.includes(text)) examples.push(text);
}

/**
 * Days that sit far from the rest of the dates, which is nearly always a
 * mistyped year. "Far" is 300 days beyond the median, or five times the
 * interquartile range where that is larger, so a surveillance series that
 * really does run for years is left alone.
 */
function findOutlierDays(dayKeys: number[]): Set<number> {
  const outliers = new Set<number>();
  if (dayKeys.length < 2) return outliers;
  const sorted = [...dayKeys].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.round((sorted.length - 1) * fraction)];
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  // Quartiles of a handful of values are the outlier itself.
  const spread = sorted.length >= 8 ? at(0.75) - at(0.25) : 0;
  const fence = Math.max(300 * DAY_MS, 5 * spread);
  for (const key of sorted) {
    if (Math.abs(key - median) > fence) outliers.add(key);
  }
  return outliers;
}

function formatDayKey(key: number): string {
  const u = new Date(key);
  const y = String(u.getUTCFullYear()).padStart(4, '0');
  return `${y}-${String(u.getUTCMonth() + 1).padStart(2, '0')}-${String(u.getUTCDate()).padStart(2, '0')}`;
}

// Annotation categories for timeline events (simplified for professional use)
export type AnnotationCategory =
  | '7-1-7'               // Response milestones (key kept for stored annotations)
  | 'exposure'            // Suspected exposure events
  | 'response'            // Interventions and control measures
  | 'data-note';          // Data quality notes (reporting lag, etc.)

export type AnnotationType =
  // Response milestones
  | 'detection'           // Outbreak detected
  | 'notification'        // Health authority notified
  | 'response-complete'   // Early response actions completed
  // Exposure
  | 'exposure'            // Suspected exposure period
  // Response actions
  | 'intervention'        // Any intervention or control measure
  // Data notes
  | 'data-note';          // Reporting lag, tentative data, etc.

export interface Annotation {
  id: string;
  type: AnnotationType;
  category: AnnotationCategory;
  date: Date;
  endDate?: Date;
  /**
   * True when `date` carries a time of day the user gave. A date-only
   * annotation is drawn at the middle of its day; a timed one at its time.
   */
  hasTime?: boolean;
  /** True when `endDate` carries a time. A date-only end means the whole of that day. */
  endHasTime?: boolean;
  label: string;
  description?: string;  // For narrative generation
  color: string;
  source: 'auto' | 'manual';  // Whether auto-calculated or user-entered
  linkedRecordIds?: string[]; // Link to specific case records
  /**
   * Label position, as a pixel offset from the annotation's anchor on the chart.
   *
   * Deliberately relative rather than absolute: bar width varies with bin count
   * (25-80px), the plot resizes with the window, and export renders at its own
   * width. An absolute coordinate would put the label somewhere meaningless the
   * next time any of those changed.
   *
   * Undefined means "not positioned by the user", which is what lets automatic
   * collision stacking apply to it.
   */
  labelOffsetX?: number;
  labelOffsetY?: number;
  /** Label styling. All optional; unset means the chart default. */
  labelFontSize?: number;
  labelFontWeight?: 'normal' | 'medium' | 'bold';
  labelFontFamily?: 'sans' | 'serif' | 'mono';
  labelShape?: 'none' | 'box' | 'pill';
}

// Annotation category metadata for UI (simplified - professional epi curve style)
// Colors are muted to not compete with case data (per CDC guidelines)
export const ANNOTATION_CATEGORIES: Record<AnnotationCategory, {
  label: string;
  color: string;
  types: { value: AnnotationType; label: string; description?: string }[];
}> = {
  // Key retained so existing annotations keep resolving; the label no longer
  // names 7-1-7 now that the scorecard has been removed.
  '7-1-7': {
    label: 'Response Milestones',
    color: '#6B7280',  // Muted gray - annotations should recede visually
    types: [
      { value: 'detection', label: 'Outbreak Detected', description: 'Date outbreak was identified' },
      { value: 'notification', label: 'Notification Sent', description: 'Date health authority was notified' },
      { value: 'response-complete', label: 'Response Completed', description: 'Date early response actions were completed' },
    ]
  },
  'exposure': {
    label: 'Exposure Events',
    color: '#9CA3AF',  // Light gray for exposure shading
    types: [
      { value: 'exposure', label: 'Exposure Period', description: 'Suspected exposure time window' },
    ]
  },
  'response': {
    label: 'Response Actions',
    color: '#6B7280',  // Muted gray
    types: [
      { value: 'intervention', label: 'Intervention', description: 'Recall, closure, advisory, or other control measure' },
    ]
  },
  'data-note': {
    label: 'Data Notes',
    color: '#9CA3AF',  // Light gray
    types: [
      { value: 'data-note', label: 'Data Note', description: 'Reporting lag, tentative data, or other data quality note' },
    ]
  },
};

// Get color for annotation type
export function getAnnotationColor(type: AnnotationType): string {
  for (const category of Object.values(ANNOTATION_CATEGORIES)) {
    if (category.types.some(t => t.value === type)) {
      return category.color;
    }
  }
  return '#6B7280';
}

// Get category for annotation type
export function getAnnotationCategory(type: AnnotationType): AnnotationCategory {
  for (const [category, meta] of Object.entries(ANNOTATION_CATEGORIES)) {
    if (meta.types.some(t => t.value === type)) {
      return category as AnnotationCategory;
    }
  }
  return 'data-note';  // Default fallback
}

// ============ Saving and restoring annotations ============
//
// Annotation dates were saved with toISOString(), a UTC instant. Local midnight
// on 10 January in Nairobi is 21:00 UTC on the 9th, so the same project file
// opened in London or New York drew the annotation on 9 January. A date is now
// saved as the date that was typed, "2026-01-10", or "2026-01-10T12:00" when a
// time was given, and means the same day everywhere.

export type StoredAnnotation = Omit<Annotation, 'date' | 'endDate'> & {
  date: string;
  endDate?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatClockDate(d: Date, withTime: boolean): string {
  const date = `${String(d.getFullYear()).padStart(4, '0')}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return withTime ? `${date}T${pad2(d.getHours())}:${pad2(d.getMinutes())}` : date;
}

export function serializeAnnotation(annotation: Annotation): StoredAnnotation {
  const { date, endDate, ...rest } = annotation;
  const stored: StoredAnnotation = { ...rest, date: formatClockDate(date, annotation.hasTime === true) };
  if (endDate) stored.endDate = formatClockDate(endDate, annotation.endHasTime === true);
  return stored;
}

function endOfLocalDay(d: Date): Date {
  return localDate(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * An annotation date saved by an earlier version: a UTC instant that was local
 * midnight (or, for an end date, the last millisecond of the day) wherever it
 * was saved.
 *
 * On the machine that saved it the instant still reads as local midnight and is
 * taken as is. Opened in another timezone it does not, and the day that was
 * meant is recovered as the UTC midnight nearest the instant, which is right
 * for every timezone within 12 hours of UTC. A file saved in New Zealand
 * daylight time or further east and opened elsewhere can still be a day out;
 * the instant alone cannot tell UTC+13 from UTC-11.
 */
function reviveLegacyInstant(text: string, isEnd: boolean): Date | null {
  const instant = new Date(text);
  if (isNaN(instant.getTime())) return null;
  const start = isEnd ? new Date(instant.getTime() + 1) : instant;
  const isLocalMidnight = start.getHours() === 0 && start.getMinutes() === 0
    && start.getSeconds() === 0 && start.getMilliseconds() === 0;
  if (isLocalMidnight) return instant;
  const nearest = new Date(Math.round(start.getTime() / DAY_MS) * DAY_MS);
  const day = localDate(nearest.getUTCFullYear(), nearest.getUTCMonth(), nearest.getUTCDate());
  if (!isEnd) return day;
  // The legacy end was the last millisecond of the day before `nearest`.
  day.setDate(day.getDate() - 1);
  return endOfLocalDay(day);
}

const ZONED_INSTANT = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Read one saved annotation, in the current or the earlier format. Null if its date is unreadable. */
export function reviveAnnotation(raw: Record<string, unknown>): Annotation | null {
  const dateText = typeof raw.date === 'string' ? raw.date : '';
  const endText = typeof raw.endDate === 'string' ? raw.endDate : '';
  const revived = { ...raw } as unknown as Annotation;

  if (ZONED_INSTANT.test(dateText)) {
    const date = reviveLegacyInstant(dateText, false);
    if (!date) return null;
    revived.date = date;
    revived.hasTime = false;
  } else {
    const w = parseWallClock(dateText);
    if (!w) return null;
    revived.date = localDate(w.year, w.month, w.day, w.hours, w.minutes);
    revived.hasTime = w.hasTime;
  }

  delete revived.endDate;
  delete revived.endHasTime;
  if (endText) {
    if (ZONED_INSTANT.test(endText)) {
      const end = reviveLegacyInstant(endText, true);
      if (end) revived.endDate = end;
    } else {
      const w = parseWallClock(endText);
      if (w) {
        revived.endDate = w.hasTime
          ? localDate(w.year, w.month, w.day, w.hours, w.minutes)
          : localDate(w.year, w.month, w.day, 23, 59, 59, 999);
        revived.endHasTime = w.hasTime;
      }
    }
  }
  return revived;
}

// ============ Where things sit along the axis ============

/**
 * A moment's position along the bars, in bar widths from the left edge of the
 * first bar (2.5 is the middle of the third bar), or null when it is off the
 * axis. Nothing is clamped to the edge: an event outside the range shown used
 * to be drawn on the last bar, where it read as having happened that day.
 */
export function positionInBins(bins: EpiCurveBin[], time: number): number | null {
  if (bins.length === 0 || isNaN(time)) return null;
  const firstStart = bins[0].startDate.getTime();
  const lastEnd = bins[bins.length - 1].endDate.getTime();
  if (time < firstStart || time > lastEnd) return null;
  if (time === lastEnd) return bins.length;
  // Bars are equal-width in clock time, so the index can be computed, then
  // nudged for a day that is an hour short or long.
  let index = Math.min(bins.length - 1, Math.max(0, Math.floor(
    ((time - firstStart) / (lastEnd - firstStart)) * bins.length
  )));
  while (index > 0 && time < bins[index].startDate.getTime()) index--;
  while (index < bins.length - 1 && time >= bins[index].endDate.getTime()) index++;
  const start = bins[index].startDate.getTime();
  const duration = bins[index].endDate.getTime() - start;
  return index + (duration > 0 ? (time - start) / duration : 0);
}

/** A stretch of the axis in bar widths, clipped to what is shown. */
export interface AxisSpan {
  start: number;
  end: number;
  /** True when the stretch really begins before the first bar. */
  clippedStart: boolean;
  /** True when it really ends after the last bar. */
  clippedEnd: boolean;
}

/** The part of a period that falls on the axis, or null when none of it does. */
export function spanInBins(bins: EpiCurveBin[], startTime: number, endTime: number): AxisSpan | null {
  if (bins.length === 0 || isNaN(startTime) || isNaN(endTime)) return null;
  const firstStart = bins[0].startDate.getTime();
  const lastEnd = bins[bins.length - 1].endDate.getTime();
  if (endTime <= firstStart || startTime >= lastEnd) return null;
  const clippedStart = startTime < firstStart;
  const clippedEnd = endTime > lastEnd;
  const start = clippedStart ? 0 : positionInBins(bins, startTime);
  const end = clippedEnd ? bins.length : positionInBins(bins, endTime);
  if (start === null || end === null) return null;
  return { start, end: Math.max(start, end), clippedStart, clippedEnd };
}

/**
 * Where an annotation is drawn, in bar widths.
 *
 * A single date with no time is drawn at the middle of its day: the centre of
 * a daily bar, the right seventh of a weekly one, noon on an hourly axis. It
 * used to be drawn at the centre of whichever bar held midnight, which on
 * 12-hour bars put an event of unknown time at 6 AM. A time, when given, is
 * drawn where it falls. A period starts at the edge of its first day (or at
 * its start time) and runs to the end of its last day (or its end time); it
 * used to start at the middle of the first bar.
 */
export function annotationSpan(annotation: Annotation, bins: EpiCurveBin[]): AxisSpan | null {
  const time = annotation.date.getTime();
  if (isNaN(time)) return null;

  if (annotation.endDate && !isNaN(annotation.endDate.getTime())) {
    // A date-only end is held as the last millisecond of its day.
    const end = annotation.endDate.getTime() + (annotation.endHasTime ? 0 : 1);
    return spanInBins(bins, time, end);
  }

  const d = annotation.date;
  const anchor = annotation.hasTime
    ? time
    : localDate(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  const position = positionInBins(bins, anchor);
  if (position === null) return null;
  return { start: position, end: position, clippedStart: false, clippedEnd: false };
}

// ============ Incubation periods and the exposure estimate ============

// Common pathogens with incubation periods (in days)
export const PATHOGEN_INCUBATION: Record<string, { min: number; max: number; typical: number }> = {
  'Salmonella': { min: 0.5, max: 3, typical: 1 },
  'E. coli O157:H7': { min: 1, max: 10, typical: 3.5 },
  'Norovirus': { min: 0.5, max: 2, typical: 1.25 },
  'Campylobacter': { min: 2, max: 5, typical: 3 },
  'Listeria': { min: 3, max: 70, typical: 21 },
  'Hepatitis A': { min: 15, max: 50, typical: 28 },
  'Shigella': { min: 1, max: 3, typical: 2 },
  'Vibrio': { min: 0.5, max: 5, typical: 1 },
  'Cryptosporidium': { min: 2, max: 10, typical: 7 },
  'Giardia': { min: 7, max: 14, typical: 10 },
  'Cyclospora': { min: 7, max: 14, typical: 7 },
  'Staphylococcus aureus': { min: 0.04, max: 0.25, typical: 0.125 },
  'Clostridium perfringens': { min: 0.33, max: 0.75, typical: 0.5 },
  'Bacillus cereus (emetic)': { min: 0.04, max: 0.25, typical: 0.125 },
  'Bacillus cereus (diarrheal)': { min: 0.33, max: 0.67, typical: 0.5 },
  'Botulism': { min: 0.5, max: 5, typical: 1.5 },
  'Cholera': { min: 0.08, max: 5, typical: 2 },
  'Typhoid': { min: 7, max: 21, typical: 14 },
  'Legionella': { min: 2, max: 10, typical: 5 },
  'Influenza': { min: 1, max: 4, typical: 2 },
  'COVID-19': { min: 2, max: 14, typical: 5 },
  // Exposure to rash onset: 7-21 days, about 14 on average (CDC Pink Book).
  'Measles': { min: 7, max: 21, typical: 14 },
  // 10-21 days, usually 14-16 (CDC Pink Book).
  'Chickenpox': { min: 10, max: 21, typical: 15 },
  'Mumps': { min: 12, max: 25, typical: 17 },
};

/**
 * An incubation limit in hours. Limits under a day are stored as rounded
 * fractions of one (0.04, 0.33), so they are rounded to the whole hour they
 * stand for (1, 8) rather than computed with as 57.6 minutes.
 */
export function incubationHours(days: number): number {
  return days < 1 ? Math.round(days * 24) : days * 24;
}

function formatIncubationLimit(days: number): string {
  return days < 1 ? `${incubationHours(days)} h` : `${days} d`;
}

/** "1–6 h", "12 h–3 d" or "2–5 d": hours for limits under a day, days otherwise. */
export function formatIncubationRange(incubation: { min: number; max: number }): string {
  if (incubation.min < 1 && incubation.max < 1) {
    return `${incubationHours(incubation.min)}–${incubationHours(incubation.max)} h`;
  }
  if (incubation.min >= 1 && incubation.max >= 1) {
    return `${incubation.min}–${incubation.max} d`;
  }
  return `${formatIncubationLimit(incubation.min)}–${formatIncubationLimit(incubation.max)}`;
}

export interface ExposureEstimate {
  start: Date;
  end: Date;
  /** True when the first onset had no time of day, so the estimate is in whole days. */
  wholeDays: boolean;
}

/**
 * The period in which the first case could have been exposed: its onset less
 * the longest incubation period, to its onset less the shortest.
 *
 * With an onset time the arithmetic is in hours. It used to be in whole days
 * from midnight of the onset date whatever the bin size, which for a toxin
 * with a 1-6 hour incubation and a first onset at 22:00 shaded the whole of the
 * previous day and none of the six hours that mattered.
 *
 * With only an onset date the time of day is unknown, so the estimate is whole
 * days and covers every exposure time consistent with an onset at any hour of
 * that date: the longest incubation rounded up to days, the shortest rounded
 * down, through the end of the last day.
 */
export function estimateExposureWindow(
  firstOnset: Date,
  onsetHasTime: boolean,
  incubation: { min: number; max: number }
): ExposureEstimate {
  if (onsetHasTime) {
    const onset = clockKeyOfDate(firstOnset);
    return {
      start: clockKeyToLocal(onset - incubationHours(incubation.max) * HOUR_MS),
      end: clockKeyToLocal(onset - incubationHours(incubation.min) * HOUR_MS),
      wholeDays: false,
    };
  }
  const y = firstOnset.getFullYear();
  const m = firstOnset.getMonth();
  const d = firstOnset.getDate();
  return {
    start: localDate(y, m, d - Math.ceil(incubation.max)),
    end: localDate(y, m, d - Math.floor(incubation.min), 23, 59, 59, 999),
    wholeDays: true,
  };
}

// ============ Building the curve ============

/** Strata in the order a reader expects, with the missing category last. */
function sortStrataKeys(keys: string[]): string[] {
  const rest = keys.filter(k => k !== MISSING_CATEGORY_LABEL);
  const alphabetical = [...rest].sort((a, b) => a.localeCompare(b));
  const shared = sortCategoryValues(rest);
  // The shared sort knows months and leading numbers ("5-9" before "10-14").
  // Where it had nothing special to apply it falls back to plain alphabetical,
  // which puts "D10" before "D2"; compare embedded numbers as numbers instead.
  const usedSpecialOrder = shared.some((value, i) => value !== alphabetical[i]);
  const ordered = usedSpecialOrder
    ? shared
    : [...rest].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b));
  return keys.includes(MISSING_CATEGORY_LABEL) ? [...ordered, MISSING_CATEGORY_LABEL] : ordered;
}

export function processEpiCurveData(
  records: CaseRecord[],
  dateColumn: string,
  requestedBinSize: BinSize,
  stratifyBy?: string,
  annotations?: Annotation[],
  timeColumn?: string,
  options: EpiCurveOptions = {}
): EpiCurveData {
  // An unrecognised size from storage is drawn daily rather than rejected.
  const requested: BinSize = isBinSize(requestedBinSize) ? requestedBinSize : 'daily';
  const maxBins = options.maxBins ?? MAX_EPI_CURVE_BINS;
  const result = emptyEpiCurveData(requested);
  const summary = result.summary;

  // Read every record's date once, and its time where a time column is given.
  interface Dated {
    record: CaseRecord;
    /** How many cases the record stands for: 1 unless a count column is in use. */
    weight: number;
    dayKey: number;
    /** Date and time together, or null when no time of day is known. */
    timedKey: number | null;
    timeProblem: 'missing' | 'unrecognised' | null;
  }
  const dated: Dated[] = [];
  const { countColumn } = options;
  for (const record of records) {
    let weight = 1;
    if (countColumn) {
      const rawCount = record[countColumn];
      const count = typeof rawCount === 'number' ? rawCount
        : typeof rawCount === 'string' && rawCount.trim() !== '' ? Number(rawCount) : NaN;
      if (!Number.isInteger(count) || count < 0) {
        // A report with no usable count says nothing about how many cases there
        // were; guessing one would put a case on the curve that nobody reported.
        summary.missingCount++;
        if (!isMissingValue(rawCount)) pushExample(summary.missingCountExamples, rawCount);
        continue;
      }
      weight = count;
    }
    const rawDate = record[dateColumn];
    if (isMissingValue(rawDate)) {
      summary.missingDate++;
      continue;
    }
    const w = parseWallClock(rawDate instanceof Date ? rawDate : String(rawDate));
    if (!w) {
      summary.unrecognisedDate++;
      pushExample(summary.unrecognisedDateExamples, rawDate);
      continue;
    }
    const dayKey = clockKey(w.year, w.month, w.day);
    let timedKey = w.hasTime ? dayKey + w.hours * HOUR_MS + w.minutes * MINUTE_MS : null;
    let timeProblem: Dated['timeProblem'] = null;
    if (timeColumn) {
      const rawTime = record[timeColumn];
      if (isMissingValue(rawTime)) {
        // A time written with the date itself still counts.
        if (timedKey === null) timeProblem = 'missing';
      } else {
        const time = parseTimeString(String(rawTime));
        if (time) {
          timedKey = dayKey + time.hours * HOUR_MS + time.minutes * MINUTE_MS;
        } else {
          timedKey = null;
          timeProblem = 'unrecognised';
        }
      }
    }
    dated.push({ record, weight, dayKey, timedKey, timeProblem });
  }

  const outlierDays = findOutlierDays(dated.map(d => d.dayKey));
  if (outlierDays.size > 0) {
    summary.outlierCount = dated.filter(d => outlierDays.has(d.dayKey)).length;
    summary.outlierExamples = Array.from(outlierDays).sort((a, b) => a - b).slice(0, 5).map(formatDayKey);
  }

  // On hourly bins a case with a date but no usable time has no bar to go in.
  // It used to be stacked on 00:00, which drew a midnight peak that was not
  // there. It is left out and counted instead. With no time column chosen at
  // all, every case is at 00:00 by the user's own choice and stays plotted.
  const isPlottable = (d: Dated, binSize: BinSize) =>
    !(isSubDailyBinSize(binSize) && timeColumn && d.timeProblem);
  const keyFor = (d: Dated, binSize: BinSize) =>
    isSubDailyBinSize(binSize) ? (d.timedKey ?? d.dayKey) : d.dayKey;

  // The first and last bar for a bin size, or null when nothing can be plotted.
  // `first` and `last` are bar numbers (see binOrdinal), not moments.
  const extentFor = (binSize: BinSize): { first: number; last: number; count: number } | null => {
    if (options.range) {
      const first = binOrdinal(clockKeyOfDate(options.range.start), binSize);
      const last = binOrdinal(clockKeyOfDate(options.range.end), binSize);
      if (isNaN(first) || isNaN(last) || last < first) return null;
      return { first, last, count: last - first + 1 };
    }

    let minKey = Infinity;
    let maxKey = -Infinity;
    for (const d of dated) {
      if (!isPlottable(d, binSize)) continue;
      const key = keyFor(d, binSize);
      if (key < minKey) minKey = key;
      if (key > maxKey) maxKey = key;
    }
    if (minKey === Infinity) return null;

    // Annotations can extend the axis beyond the data
    let annotationMin = minKey;
    let annotationMax = maxKey;
    (annotations ?? []).forEach(ann => {
      const start = clockKeyOfDate(ann.date);
      if (start < annotationMin) annotationMin = start;
      if (start > annotationMax) annotationMax = start;
      if (ann.endDate) {
        const end = clockKeyOfDate(ann.endDate);
        if (end > annotationMax) annotationMax = end;
      }
    });

    // One empty bin each side, so the curve visibly starts from and returns to
    // zero without burying a short outbreak in blank space. A wider window is
    // what the custom date range is for.
    let first = binOrdinal(annotationMin, binSize) - 1;
    let last = binOrdinal(annotationMax, binSize) + 1;

    // If annotations extend beyond data range, add 1 extra bin for padding
    if (annotationMin < binStartKey(minKey, binSize)) first -= 1;
    if (annotationMax > ordinalStartKey(binOrdinal(maxKey, binSize) + 1, binSize)) last += 1;

    return { first, last, count: last - first + 1 };
  };

  // Coarsen a request that needs more bars than can be drawn.
  let binSize = requested;
  let extent = extentFor(binSize);
  if (extent && extent.count > maxBins) {
    result.requestedBinCount = extent.count;
    let coarser = COARSER_BIN_SIZE[binSize];
    while (extent && extent.count > maxBins && coarser) {
      binSize = coarser;
      extent = extentFor(binSize);
      coarser = COARSER_BIN_SIZE[binSize];
    }
  }
  result.binSize = binSize;

  const countTimeProblems = () => {
    if (!isSubDailyBinSize(binSize) || !timeColumn) return;
    for (const d of dated) {
      if (d.timeProblem === 'missing') summary.missingTime++;
      if (d.timeProblem === 'unrecognised') {
        summary.unrecognisedTime++;
        pushExample(summary.unrecognisedTimeExamples, d.record[timeColumn]);
      }
    }
  };

  if (!extent) {
    countTimeProblems();
    return result;
  }
  if (extent.count > maxBins) {
    // Weekly bars and still too many: a span of decades. Draw nothing and say so.
    result.tooManyBins = true;
    result.requestedBinCount = result.requestedBinCount || extent.count;
    return result;
  }
  countTimeProblems();

  const bins: EpiCurveBin[] = [];
  for (let i = 0; i < extent.count; i++) {
    const startKey = ordinalStartKey(extent.first + i, binSize);
    bins.push({
      startDate: clockKeyToLocal(startKey),
      endDate: clockKeyToLocal(ordinalStartKey(extent.first + i + 1, binSize)),
      startKey,
      label: formatBinLabel(startKey, binSize),
      cases: [],
      strata: new Map<string, CaseRecord[]>(),
      strataTotals: new Map<string, number>(),
      total: 0,
    });
  }

  // One pass: each record's bar is computed, not searched for.
  let firstKey = Infinity;
  let lastKey = -Infinity;
  let anyTimed = false;
  for (const d of dated) {
    if (!isPlottable(d, binSize)) continue;
    const key = keyFor(d, binSize);
    const index = binOrdinal(key, binSize) - extent.first;
    if (index < 0 || index >= bins.length) {
      summary.outsideRange++;
      continue;
    }
    const bin = bins[index];
    bin.cases.push(d.record);
    bin.total += d.weight;
    if (stratifyBy) {
      const strataValue = categoryValue(d.record[stratifyBy]);
      const group = bin.strata.get(strataValue);
      if (group) group.push(d.record);
      else bin.strata.set(strataValue, [d.record]);
      bin.strataTotals.set(strataValue, (bin.strataTotals.get(strataValue) ?? 0) + d.weight);
    }
    // A report of zero cases is on the curve but is not an onset.
    if (d.weight > 0) {
      if (key < firstKey) firstKey = key;
      if (key > lastKey) lastKey = key;
      if (isSubDailyBinSize(binSize) && d.timedKey !== null) anyTimed = true;
    }
    summary.plotted += d.weight;
    summary.plottedRecords++;
  }

  if (firstKey !== Infinity) {
    summary.firstOnset = clockKeyToLocal(firstKey);
    summary.lastOnset = clockKeyToLocal(lastKey);
    summary.onsetHasTime = anyTimed;
  }

  // Get all unique strata keys
  const strataKeysSet = new Set<string>();
  bins.forEach(bin => {
    bin.strata.forEach((_, key) => strataKeysSet.add(key));
  });

  let maxCount = 0;
  let peakBinIndex = -1;
  bins.forEach((b, i) => {
    if (b.total > maxCount) {
      maxCount = b.total;
      peakBinIndex = i;
    }
  });

  return {
    ...result,
    bins,
    maxCount,
    strataKeys: sortStrataKeys(Array.from(strataKeysSet)),
    dateRange: {
      start: clockKeyToLocal(ordinalStartKey(extent.first, binSize)),
      end: clockKeyToLocal(ordinalStartKey(extent.last, binSize)),
    },
    peakBinIndex,
  };
}

// ============ A starting bin size ============

export interface BinSizeEvidence {
  /** Days from the first dated case to the last. */
  spanDays: number;
  /** Cases to be plotted: records, or their counts added up. */
  cases: number;
  /** Whether any case has a time of day. Without one, bins finer than a day are spikes at midnight. */
  hasTimes: boolean;
  /**
   * The smallest gap between two different dates, in days, or null with fewer
   * than two. Monthly reports are 28 or more days apart; a curve drawn in
   * weeks from them is one bar and three gaps, twelve times a year.
   */
  minGapDays: number | null;
}

/** Bin sizes from finest to coarsest, with their width in days. */
const BIN_WIDTH_DAYS: [BinSize, number][] = [
  ['hourly', 1 / 24], ['6hour', 0.25], ['12hour', 0.5], ['daily', 1], ['weekly-cdc', 7], ['monthly', 30.44],
];

/**
 * The bin size a curve opens with, until the user chooses one.
 *
 * The finest size that the data can fill: no finer than the dates themselves
 * are spaced, and with no more bars than the number of cases can give a shape
 * to. The limit on bars is three times the square root of the cases, kept
 * between 10 and 60. Forty-four cases over 34 hours opened as 35 hourly bars of
 * one or two cases each, which shows no curve at all; the same cases in seven
 * 6-hour bars show the rise and fall. A year of weekly counts is not pushed
 * into months, and four years of monthly reports are not drawn in weeks.
 *
 * This is a starting point only. The choice of bin size is the reader's.
 */
export function suggestBinSize({ spanDays, cases, hasTimes, minGapDays }: BinSizeEvidence): BinSize {
  const maxBars = Math.min(60, Math.max(10, Math.round(3 * Math.sqrt(Math.max(cases, 0)))));
  const finestWidth = minGapDays === null ? 0
    : minGapDays >= 28 ? 30.44
      : minGapDays >= 7 ? 7
        : 0;
  for (const [binSize, width] of BIN_WIDTH_DAYS) {
    if (width < 1 && !hasTimes) continue;
    if (width < finestWidth) continue;
    if (spanDays / width + 1 <= maxBars) return binSize;
  }
  return 'monthly';
}

// ============ The count axis ============

/**
 * The top of the count axis: the smallest value at or above `atLeast` that
 * divides into five steps a reader can count in.
 *
 * The axis has five intervals. Small curves keep steps of whole cases (1, 2,
 * 3...). Once the steps would pass ten they are rounded up to 10, 15, 20, 25,
 * 30, 40, 50, 60, 80 or a power of ten times those: a curve of monthly counts peaking
 * at 916 was drawn with ticks at 184, 368, 552, 736 and 920.
 */
export function niceAxisMax(atLeast: number): number {
  const rawStep = Math.max(1, atLeast) / 5;
  if (rawStep <= 10) return Math.ceil(rawStep) * 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * magnitude).find(s => s >= rawStep) ?? 10 * magnitude;
  return step * 5;
}

// ============ Axis labels ============

export interface AxisLabel {
  /** Index of the bin the label belongs to. */
  index: number;
  text: string;
}

/** Label spacings, in bins, that land on round clock or calendar values. */
const LABEL_STEPS: Record<BinSize, number[]> = {
  hourly: [1, 2, 3, 4, 6, 12, 24, 48, 72, 168],
  '6hour': [1, 2, 4, 8, 12, 28],
  '12hour': [1, 2, 4, 6, 14, 28],
  daily: [1, 2, 7, 14, 28],
  'weekly-cdc': [1, 2, 4, 8, 13, 26, 52],
  'weekly-iso': [1, 2, 4, 8, 13, 26, 52],
  // Counted from January, so quarterly and yearly labels fall on January.
  monthly: [1, 2, 3, 6, 12, 24, 60],
};

/**
 * Which bars get an x-axis label when there are too many to label them all.
 *
 * Every Nth bar counted from the first was labelled before, so an hourly axis
 * was labelled 23:00, 3:00, 7:00... and the midnight bars, which are where
 * date-only cases sit, never got one. Labels now fall on round values (midnight
 * on an hourly axis, Mondays on a daily one), counted from a fixed origin so
 * they do not shift when the range changes.
 *
 * When the axis spans more than one calendar year, the first label and the
 * first label of each new year carry the year.
 */
export function chooseAxisLabels(bins: EpiCurveBin[], binSize: BinSize, maxLabels: number): AxisLabel[] {
  if (bins.length === 0) return [];
  const limit = Math.max(1, Math.floor(maxLabels));

  const steps = LABEL_STEPS[binSize] ?? LABEL_STEPS.daily;
  let step = steps.find(s => Math.ceil(bins.length / s) <= limit) ?? 0;
  if (step === 0) {
    step = steps[steps.length - 1];
    while (Math.ceil(bins.length / step) > limit) step *= 2;
  }
  const labelStep = step;

  // Daily bins a week or more apart are labelled on Mondays.
  const offset = binSize === 'daily' && labelStep % 7 === 0 ? 3 : 0;
  const yearOf = (bin: EpiCurveBin) => new Date(bin.startKey).getUTCFullYear();
  const spansYears = yearOf(bins[0]) !== yearOf(bins[bins.length - 1]);

  const labels: AxisLabel[] = [];
  let previousYear: number | null = null;
  bins.forEach((bin, index) => {
    if (mod(binOrdinal(bin.startKey, binSize) + offset, labelStep) !== 0) return;
    const year = yearOf(bin);
    const withYear = spansYears && year !== previousYear;
    previousYear = year;
    labels.push({ index, text: withYear ? formatBinLabel(bin.startKey, binSize, true) : bin.label });
  });
  return labels;
}

/** A bin's label with its year, for tooltips. */
export function fullBinLabel(bin: EpiCurveBin, binSize: BinSize): string {
  return formatBinLabel(bin.startKey, binSize, true);
}

/**
 * What a reader needs to be told about the bars that the labels do not say.
 * A weekly curve was labelled "Mar 2, Mar 9, Mar 16" with nothing to show the
 * bars were weeks, or whether they ran Sunday to Saturday or Monday to Sunday.
 */
export function binSizeNote(binSize: BinSize): string {
  switch (binSize) {
    case 'weekly-cdc':
      return 'Each bar is one week, Sunday to Saturday (CDC/MMWR weeks), labelled with its first day.';
    case 'weekly-iso':
      return 'Each bar is one week, Monday to Sunday (ISO weeks), labelled with its first day.';
    case 'monthly':
      return 'Each bar is one calendar month.';
    default:
      return '';
  }
}

export const BIN_SIZE_NAMES: Record<BinSize, string> = {
  hourly: 'hourly',
  '6hour': '6-hour',
  '12hour': '12-hour',
  daily: 'daily',
  'weekly-cdc': 'weekly (CDC/MMWR)',
  'weekly-iso': 'weekly (ISO)',
  monthly: 'monthly',
};

// ============ Colours ============

const CLASSIFICATION_COLORS = {
  confirmed: '#DC2626',
  probable: '#F59E0B',
  suspected: '#3B82F6',
  unknown: '#9CA3AF',
  nonCase: '#6B7280',
};

/**
 * The case classification a stratum value names, whatever its spelling.
 *
 * Only the exact strings "Confirmed", "Probable" and "Suspected" were matched
 * before. "Suspect", the CDC spelling, fell through to the default palette by
 * position and came out the same amber as Probable; lower-case values lost
 * their colours altogether.
 */
function classificationOf(strataKey: string): keyof typeof CLASSIFICATION_COLORS | null {
  const text = strataKey.trim().toLowerCase();
  if (text === '' || text === MISSING_CATEGORY_LABEL.toLowerCase() || /^(missing|unk|not known|undetermined|pending)$/.test(text)) {
    return 'unknown';
  }
  // Negation first, so "Not confirmed" and "Not a case" are not coloured as cases.
  if (readsAsNonCase(strataKey)) return 'nonCase';
  if (/confirm/.test(text)) return 'confirmed';
  if (/probable/.test(text)) return 'probable';
  if (/suspect|possible/.test(text)) return 'suspected';
  return null;
}

export function getColorForStrata(
  strataKey: string,
  index: number,
  scheme: ColorScheme
): string {
  const defaultColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  // For values the classification scheme does not name: the default palette
  // without the blue, amber and red it has already given a meaning.
  const unclassifiedColors = [
    '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  const colorblindColors = [
    '#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311',
    '#EE3377', '#BBBBBB', '#000000'
  ];

  const grayscaleColors = [
    '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF',
    '#D1D5DB', '#E5E7EB', '#F3F4F6'
  ];

  switch (scheme) {
    case 'classification': {
      const classification = classificationOf(strataKey);
      return classification
        ? CLASSIFICATION_COLORS[classification]
        : unclassifiedColors[index % unclassifiedColors.length];
    }
    case 'colorblind':
      return colorblindColors[index % colorblindColors.length];
    case 'grayscale':
      return grayscaleColors[index % grayscaleColors.length];
    default:
      return defaultColors[index % defaultColors.length];
  }
}

export function findFirstCaseDate(records: CaseRecord[], dateColumn: string): Date | null {
  let firstTime = Infinity;
  records.forEach(r => {
    const dateVal = r[dateColumn];
    if (!dateVal) return;
    const t = parseLocalDate(String(dateVal)).getTime();
    if (t < firstTime) firstTime = t;
  });
  return firstTime === Infinity ? null : new Date(firstTime);
}
