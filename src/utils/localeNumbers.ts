import type { LocaleConfig } from '../contexts/LocaleContext';

/**
 * Reading numbers out of text.
 *
 * The decimal mark cannot be taken from the browser's locale. An analyst whose
 * browser is set to German still receives period-decimal files from R, DHIS2
 * and this app's own export, and one whose browser is in English still opens
 * semicolon files from French Excel. Trusting the locale turned a latitude of
 * 9.082 into 9082 in the first case and a birth weight of 3,250 kg into 3250
 * in the second, with nothing on screen to say so.
 *
 * What a mark means is decided from the text instead:
 *
 *   1.234,56   1,234.56   both marks: the last one is the decimal mark
 *   1.234.567             a repeated mark groups thousands
 *   12,5   0,125   1234,567   a group that is not exactly three digits, a
 *                         leading zero, or more than three leading digits
 *                         cannot be thousands, so the mark is a decimal mark
 *   1 234,5               a space groups thousands
 *
 * Only one shape stays open: one to three digits, one mark, exactly three
 * digits ("9.082", "3,250"). A column usually settles it through its other
 * values. Where nothing does, the value is read as a decimal and the importer
 * asks the user, since nothing here can tell a latitude from a population.
 */
export type DecimalMark = '.' | ',';

/** How an open-shaped value ("1.234") is to be read. */
export type NumberReading = 'decimal' | 'thousands';

/** One value's shape, and what it proves about the marks it uses. */
export type NumberShape =
  /** No mark whose meaning is in question. */
  | { kind: 'plain'; value: number }
  /** `mark` is proven to be the decimal mark; `groupMark` proven to group. */
  | { kind: 'decimal'; mark: DecimalMark; groupMark?: DecimalMark; value: number }
  /** `mark` is proven to group thousands. */
  | { kind: 'grouped'; mark: DecimalMark; value: number }
  /** The open shape: `mark` could be either. */
  | { kind: 'open'; mark: DecimalMark; asDecimal: number; asThousands: number };

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Fold the characters that mean the same thing as ASCII ones. */
function normalizeNumberText(raw: string): string {
  let text = raw.trim().replace(/\u2212/g, '-');
  // Arabic-Indic digits, and the Arabic marks, which are never ambiguous.
  if (/[\u0660-\u0669\u06f0-\u06f9\u066b\u066c]/.test(text)) {
    text = text
      .replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - ARABIC_INDIC_ZERO))
      .replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
      .replace(/\u066c/g, '')
      .replace(/\u066b/g, '.');
  }
  return text;
}

/**
 * Work out what a piece of text is as a number. Returns null when it is not
 * one. Hexadecimal, and an exponent written without a sign or a decimal point
 * ("1E5", "12E10"), are not numbers here: in a line list those are sample and
 * lab codes far more often than quantities.
 */
export function classifyNumber(raw: string): NumberShape | null {
  let text = normalizeNumberText(raw);
  if (!text) return null;

  // Space, no-break space, narrow no-break space or apostrophe between groups
  // of three can only be grouping, which makes any other mark the decimal one.
  let spaceGrouped = false;
  if (/^[+-]?\d{1,3}(?:[ \u00a0\u202f']\d{3})+(?:[.,]\d+)?$/.test(text)) {
    text = text.replace(/[ \u00a0\u202f']/g, '');
    spaceGrouped = true;
  }

  if (/^[+-]?\d+\.?$/.test(text)) return { kind: 'plain', value: Number(text) };
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]\d{1,3}$/.test(text) || /^[+-]?\d+\.\d+[eE]\d{1,3}$/.test(text)) {
    const value = Number(text);
    return isFinite(value) ? { kind: 'plain', value } : null;
  }
  if (!/^[+-]?[\d.,]+$/.test(text)) return null;

  const dots = text.split('.').length - 1;
  const commas = text.split(',').length - 1;

  if (dots > 0 && commas > 0) {
    const mark: DecimalMark = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const groupMark: DecimalMark = mark === '.' ? ',' : '.';
    if ((mark === '.' ? dots : commas) !== 1 || spaceGrouped) return null;
    const [whole, fraction] = text.split(mark);
    const grouping = new RegExp(`^[+-]?\\d{1,3}(?:\\${groupMark}\\d{3})+$`);
    if (!grouping.test(whole) || !/^\d+$/.test(fraction)) return null;
    return { kind: 'decimal', mark, groupMark, value: Number(`${whole.split(groupMark).join('')}.${fraction}`) };
  }

  const mark: DecimalMark = dots > 0 ? '.' : ',';
  const count = dots + commas;

  if (count > 1) {
    if (spaceGrouped) return null;
    const grouping = new RegExp(`^[+-]?\\d{1,3}(?:\\${mark}\\d{3})+$`);
    if (!grouping.test(text)) return null;
    return { kind: 'grouped', mark, value: Number(text.split(mark).join('')) };
  }

  const [whole, fraction] = text.split(mark);
  if (!/^[+-]?\d*$/.test(whole) || !/^\d+$/.test(fraction)) return null;
  const digits = whole.replace(/[+-]/, '');
  const asDecimal = Number(`${whole === '' || whole === '+' || whole === '-' ? `${whole}0` : whole}.${fraction}`);
  if (isNaN(asDecimal)) return null;
  const mustBeDecimal =
    spaceGrouped || fraction.length !== 3 || digits === '' || digits.startsWith('0') || digits.length > 3;
  if (mustBeDecimal) return { kind: 'decimal', mark, value: asDecimal };
  return { kind: 'open', mark, asDecimal, asThousands: Number(`${whole}${fraction}`) };
}

/** The number a shape stands for, given how to read each mark's open values. */
export function numberFromShape(
  shape: NumberShape,
  readings: Partial<Record<DecimalMark, NumberReading>> = {}
): number {
  if (shape.kind !== 'open') return shape.value;
  return readings[shape.mark] === 'thousands' ? shape.asThousands : shape.asDecimal;
}

export interface NumberColumnAnalysis {
  /** False when the values contradict each other about what a mark means. */
  consistent: boolean;
  /** How open-shaped values are read for each mark, from the column's evidence. */
  readings: Partial<Record<DecimalMark, NumberReading>>;
  /**
   * Set when open-shaped values exist and nothing in the column, nor the file's
   * delimiter, says how to read them. The reading in `readings` is then only a
   * default, and the user should be asked.
   */
  openMark: DecimalMark | null;
  openCount: number;
  openExamples: string[];
}

/**
 * Decide what the marks mean across a column of number text.
 *
 * `delimiter` is the field delimiter of the file the column came from, which
 * is evidence in its own right: a semicolon-delimited file is one written with
 * decimal commas, and in a comma-delimited file a period is the decimal mark.
 */
export function analyzeNumberColumn(values: string[], delimiter?: string): NumberColumnAnalysis {
  const proven: Record<DecimalMark, { decimal: boolean; thousands: boolean }> = {
    '.': { decimal: false, thousands: false },
    ',': { decimal: false, thousands: false },
  };
  const open: Record<DecimalMark, string[]> = { '.': [], ',': [] };

  for (const value of values) {
    const shape = classifyNumber(value);
    if (!shape || shape.kind === 'plain') continue;
    if (shape.kind === 'decimal') {
      proven[shape.mark].decimal = true;
      if (shape.groupMark) proven[shape.groupMark].thousands = true;
    } else if (shape.kind === 'grouped') {
      proven[shape.mark].thousands = true;
    } else {
      open[shape.mark].push(value.trim());
    }
  }

  const result: NumberColumnAnalysis = {
    consistent: true, readings: {}, openMark: null, openCount: 0, openExamples: [],
  };

  const contradictory =
    (proven['.'].decimal && proven['.'].thousands) ||
    (proven[','].decimal && proven[','].thousands) ||
    (proven['.'].thousands && proven[','].thousands);
  if (contradictory) return { ...result, consistent: false };

  const unresolved: DecimalMark[] = [];
  for (const mark of ['.', ','] as const) {
    if (open[mark].length === 0) continue;
    if (proven[mark].decimal) result.readings[mark] = 'decimal';
    else if (proven[mark].thousands) result.readings[mark] = 'thousands';
    else unresolved.push(mark);
  }

  // "1.234" and "5,678" in one column with nothing else to go on: one of the
  // marks must be grouping, and there is no telling which.
  if (unresolved.length > 1) return { ...result, consistent: false };

  if (unresolved.length === 1) {
    const mark = unresolved[0];
    const other: DecimalMark = mark === '.' ? ',' : '.';
    const delimiterSaysDecimal =
      (delimiter === ';' && mark === ',') || (delimiter === ',' && mark === '.');
    if (proven[other].decimal) {
      // The other mark is this column's decimal mark, so this one most likely
      // groups. Still asked about, since a column typed by several people can
      // use both marks as decimals.
      result.readings[mark] = 'thousands';
    } else {
      result.readings[mark] = 'decimal';
      if (delimiterSaysDecimal) return result;
    }
    result.openMark = mark;
    result.openCount = open[mark].length;
    result.openExamples = [...new Set(open[mark])].slice(0, 3);
  }

  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse one number written as text.
 *
 * The meaning of each mark is taken from the text itself (see above). The
 * locale's own separators are honoured for the Arabic marks; for "." and ","
 * an open-shaped value such as "1.234" is read as a decimal under every
 * locale, so a value exported by this app reads back unchanged whatever the
 * display setting is.
 *
 * @returns Parsed number or NaN if invalid
 */
export function parseLocaleNumber(value: string, config: LocaleConfig): number {
  if (!value || typeof value !== 'string') {
    return NaN;
  }

  let text = value;
  // A locale whose separators are not "." or "," (Arabic) writes them
  // unambiguously, so they can simply be mapped.
  if (config.thousandsSeparator && !'., '.includes(config.thousandsSeparator)) {
    text = text.replace(new RegExp(escapeRegExp(config.thousandsSeparator), 'g'), '');
  }
  if (config.decimalSeparator && !'.,'.includes(config.decimalSeparator)) {
    text = text.replace(new RegExp(escapeRegExp(config.decimalSeparator), 'g'), '.');
  }

  const shape = classifyNumber(text);
  return shape ? numberFromShape(shape) : NaN;
}

/**
 * Parse a number that might already be a number or a locale-formatted string
 * @param value - Number or string
 * @param config - Locale configuration
 * @returns Parsed number or NaN
 */
export function parseFlexibleNumber(value: number | string | undefined | null, config: LocaleConfig): number {
  if (value === undefined || value === null || value === '') {
    return NaN;
  }

  if (typeof value === 'number') {
    return value;
  }

  return parseLocaleNumber(String(value), config);
}

/**
 * Format a number for display using locale-specific separators
 * @param value - Number to format
 * @param config - Locale configuration
 * @param decimals - Number of decimal places (default: auto)
 * @returns Formatted string
 */
export function formatLocaleNumber(
  value: number,
  config: LocaleConfig,
  decimals?: number
): string {
  if (isNaN(value) || !isFinite(value)) {
    return '';
  }

  // Use Intl.NumberFormat for proper locale formatting
  const formatter = new Intl.NumberFormat(config.intlLocale, {
    minimumFractionDigits: decimals !== undefined ? decimals : 0,
    maximumFractionDigits: decimals !== undefined ? decimals : 20,
    useGrouping: true,
  });

  return formatter.format(value);
}

/**
 * Format a number as percentage with locale-specific separators
 * @param value - Number to format (0.0-1.0)
 * @param config - Locale configuration
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatLocalePercent(
  value: number,
  config: LocaleConfig,
  decimals: number = 1
): string {
  if (isNaN(value) || !isFinite(value)) {
    return '';
  }

  const percentage = value * 100;
  return formatLocaleNumber(percentage, config, decimals) + '%';
}

/**
 * Format a number for CSV export (always uses period as decimal)
 * This ensures R compatibility regardless of locale
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: auto)
 * @returns Formatted string with period as decimal separator
 */
export function formatCsvNumber(value: number, decimals?: number): string {
  if (isNaN(value) || !isFinite(value)) {
    return '';
  }

  if (decimals !== undefined) {
    return value.toFixed(decimals);
  }

  return String(value);
}

/**
 * Create a number input handler that accepts locale-specific input
 * Returns a standardized number (with period decimal) for internal use
 * @param config - Locale configuration
 * @returns Function to handle input change events
 */
export function createLocaleNumberInputHandler(config: LocaleConfig) {
  return (value: string): number => {
    return parseLocaleNumber(value, config);
  };
}

/**
 * Validate if a string is a valid number in the current locale
 * @param value - String to validate
 * @param config - Locale configuration
 * @returns true if valid number
 */
export function isValidLocaleNumber(value: string, config: LocaleConfig): boolean {
  const parsed = parseLocaleNumber(value, config);
  return !isNaN(parsed) && isFinite(parsed);
}

/**
 * Get the pattern for HTML input validation based on locale
 * This allows both locale format and standard format
 * @param config - Locale configuration
 * @returns Regex pattern string for input validation
 */
export function getNumberInputPattern(config: LocaleConfig): string {
  // Allow optional minus, digits with optional thousands separators, optional decimal part
  const thousands = config.thousandsSeparator === '.' ? '\\.' : config.thousandsSeparator;

  // Allow both locale format and period format for flexibility
  return `^-?\\d+(${thousands}\\d{3})*([.,]\\d+)?$`;
}

/**
 * Format a number to a specified number of significant figures.
 * More appropriate than fixed decimal places for statistical displays,
 * as it adapts precision to the magnitude of the number.
 *
 * Examples with 3 sig figs:
 *   0.00456 → "0.00456"
 *   1.23    → "1.23"
 *   45.6    → "45.6"
 *   1234    → "1230"
 */
export function formatSigFigs(n: number, sigFigs: number = 3): string {
  if (!isFinite(n)) return '-';
  if (n === 0) return '0';
  // Round first, then count decimals from the rounded value: 99.96 rounds up
  // into the next power of ten, and sizing the decimals from the unrounded
  // number printed it as "100.0", one figure more than asked for.
  const rounded = Number(n.toPrecision(sigFigs));
  const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
  const precision = sigFigs - 1 - magnitude;
  if (precision < 0) return String(rounded);
  return rounded.toFixed(precision);
}

/**
 * Format a percentage using significant figures appropriate to the sample size.
 * Uses 2 significant figures for n < 1000, 3 for n >= 1000.
 * Prevents rounding artifacts at the 0% and 100% boundaries.
 */
export function formatStatPercent(value: number, sampleSize: number): string {
  if (!isFinite(value)) return '-';
  if (value === 0) return '0';
  if (value === 100) return '100';
  const sigFigs = sampleSize >= 1000 ? 3 : 2;
  const formatted = formatSigFigs(value, sigFigs);
  // Prevent misleading 0% or 100% when value is not exactly 0 or 100
  if (formatted === '0' && value > 0) return '<1';
  if (formatted === '100' && value < 100) return '>99';
  return formatted;
}
