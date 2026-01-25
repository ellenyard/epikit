/**
 * String similarity utilities for fuzzy duplicate detection
 * Implements Jaro-Winkler similarity, optimized for name matching
 */

/**
 * Calculate Jaro similarity between two strings
 * Returns a value between 0 (no similarity) and 1 (identical)
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Gives more weight to strings that match from the beginning (good for names)
 * Returns a value between 0 (no similarity) and 1 (identical)
 *
 * @param s1 First string
 * @param s2 Second string
 * @param prefixScale Weight given to common prefix (default 0.1, max 0.25)
 */
export function jaroWinklerSimilarity(
  s1: string,
  s2: string,
  prefixScale: number = 0.1
): number {
  // Normalize strings: lowercase and trim
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  const jaroSim = jaroSimilarity(str1, str2);

  // Find common prefix (up to 4 characters)
  let prefixLength = 0;
  const maxPrefix = Math.min(4, str1.length, str2.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (str1[i] === str2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Jaro-Winkler adjustment
  return jaroSim + prefixLength * prefixScale * (1 - jaroSim);
}

/**
 * Check if two dates are within a specified number of days of each other
 *
 * @param date1 First date (string or Date)
 * @param date2 Second date (string or Date)
 * @param toleranceDays Maximum allowed difference in days
 * @returns true if dates are within tolerance
 */
export function datesWithinRange(
  date1: unknown,
  date2: unknown,
  toleranceDays: number
): boolean {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);

  if (!d1 || !d2) return false;

  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays <= toleranceDays;
}

/**
 * Parse a date value from various formats
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate similarity between two values, handling different types
 * (Internal utility - not exported)
 *
 * @param val1 First value
 * @param val2 Second value
 * @param fieldType Type of field ('text', 'date', 'number')
 * @param options Configuration options
 * @returns Similarity score (0 to 1) or null if comparison not possible
 */
function calculateFieldSimilarity(
  val1: unknown,
  val2: unknown,
  fieldType: 'text' | 'date' | 'number' | 'boolean',
  options: {
    textThreshold?: number;
    dateTolerance?: number;
  } = {}
): number | null {
  // Handle empty values
  const isEmpty1 = val1 === null || val1 === undefined || String(val1).trim() === '';
  const isEmpty2 = val2 === null || val2 === undefined || String(val2).trim() === '';

  if (isEmpty1 && isEmpty2) return 1; // Both empty = match
  if (isEmpty1 || isEmpty2) return 0; // One empty = no match

  switch (fieldType) {
    case 'text': {
      const str1 = String(val1);
      const str2 = String(val2);
      return jaroWinklerSimilarity(str1, str2);
    }

    case 'date': {
      const tolerance = options.dateTolerance ?? 0;
      if (tolerance === 0) {
        // Exact match for dates
        const d1 = parseDate(val1);
        const d2 = parseDate(val2);
        if (!d1 || !d2) return null;
        return d1.getTime() === d2.getTime() ? 1 : 0;
      }
      return datesWithinRange(val1, val2, tolerance) ? 1 : 0;
    }

    case 'number': {
      const num1 = Number(val1);
      const num2 = Number(val2);
      if (isNaN(num1) || isNaN(num2)) return null;
      return num1 === num2 ? 1 : 0;
    }

    case 'boolean': {
      const bool1 = String(val1).toLowerCase();
      const bool2 = String(val2).toLowerCase();
      const truthy = ['true', 'yes', '1'];
      const falsy = ['false', 'no', '0'];
      const isBool1True = truthy.includes(bool1);
      const isBool1False = falsy.includes(bool1);
      const isBool2True = truthy.includes(bool2);
      const isBool2False = falsy.includes(bool2);

      if ((isBool1True && isBool2True) || (isBool1False && isBool2False)) return 1;
      if ((isBool1True || isBool1False) && (isBool2True || isBool2False)) return 0;
      return null;
    }

    default:
      return null;
  }
}

/**
 * Calculate overall similarity between two records across multiple fields
 * Returns average similarity across all compared fields
 *
 * @param record1 First record
 * @param record2 Second record
 * @param fields Fields to compare with their types
 * @param options Matching options
 * @returns Overall similarity (0 to 1)
 */
export function calculateRecordSimilarity(
  record1: Record<string, unknown>,
  record2: Record<string, unknown>,
  fields: Array<{ key: string; type: 'text' | 'date' | 'number' | 'boolean' }>,
  options: {
    textThreshold?: number;
    dateTolerance?: number;
  } = {}
): number {
  if (fields.length === 0) return 0;

  let totalSimilarity = 0;
  let comparableFields = 0;

  for (const field of fields) {
    const similarity = calculateFieldSimilarity(
      record1[field.key],
      record2[field.key],
      field.type,
      options
    );

    if (similarity !== null) {
      totalSimilarity += similarity;
      comparableFields++;
    }
  }

  if (comparableFields === 0) return 0;
  return totalSimilarity / comparableFields;
}
