import type { LocaleConfig } from '../contexts/LocaleContext';

/**
 * Parse a number string that may use locale-specific formatting
 * Handles both period and comma as decimal separators
 * @param value - The string to parse (e.g., "1,5" or "1.5" or "1.234,56")
 * @param config - Locale configuration
 * @returns Parsed number or NaN if invalid
 */
export function parseLocaleNumber(value: string, config: LocaleConfig): number {
  if (!value || typeof value !== 'string') {
    return NaN;
  }

  // Remove whitespace
  let cleaned = value.trim();

  // Remove thousands separators
  if (config.thousandsSeparator) {
    // Escape special regex characters
    const escapedSeparator = config.thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedSeparator, 'g'), '');
  }

  // Replace locale decimal separator with period
  if (config.decimalSeparator !== '.') {
    const escapedDecimal = config.decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedDecimal, 'g'), '.');
  }

  return parseFloat(cleaned);
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
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const precision = sigFigs - 1 - magnitude;
  if (precision < 0) {
    const factor = Math.pow(10, -precision);
    return String(Math.round(n / factor) * factor);
  }
  return n.toFixed(Math.max(0, precision));
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
