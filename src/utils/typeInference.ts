/**
 * Shared heuristics for inferring a column's type on import.
 *
 * Kept out of the individual parsers so CSV and Excel agree. They previously
 * carried separate copies of the inference logic and had drifted on nothing,
 * but both mangled identifiers the same way.
 */

/**
 * True when a value looks like an identifier that merely happens to be digits,
 * rather than a quantity.
 *
 * A leading zero is the tell. "007", "012" and "0450" are participant IDs,
 * facility codes, postal codes or ICD codes; converting them to 7, 12 and 450
 * silently destroys them, breaks joins against files that kept them as text,
 * and displays the wrong ID in a line list. A bare "0" is a real number, and
 * so is "0.5", so neither is caught here.
 */
export function looksLikeIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Leading zero followed by another digit, so "0" and "0.5" are excluded.
  return /^-?0\d/.test(value.trim());
}

/**
 * True when every value is numeric AND none of them looks like a
 * zero-padded identifier.
 */
export function isNumericColumn(
  values: unknown[],
  toNumber: (value: unknown) => number = (v) => Number(v)
): boolean {
  if (values.length === 0) return false;
  if (values.some(looksLikeIdentifier)) return false;
  return values.every(v => {
    if (typeof v === 'number') return true;
    if (typeof v === 'string') {
      if (v.trim() === '') return false;
      const n = toNumber(v);
      return !isNaN(n);
    }
    return false;
  });
}
