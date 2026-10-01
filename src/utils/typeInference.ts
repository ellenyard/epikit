/**
 * Shared heuristics for inferring a column's type on import.
 *
 * Kept out of the individual parsers so CSV and Excel agree. They previously
 * carried separate copies of the inference logic and had drifted on nothing,
 * but both mangled identifiers the same way.
 */
import { classifyNumber } from './localeNumbers';

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
 * True for a string of digits that is a label rather than a quantity.
 *
 * National IDs, lab accession numbers and barcodes run past the 15 to 16
 * digits a floating-point number keeps. Read as a number,
 * 1234567890123456789 becomes 1234567890123456800 and six distinct IDs
 * collapse into two. Nothing counted or measured in a line list is written to
 * sixteen digits, so anything that long is a label. So is a long run of
 * digits behind a plus sign, which is a telephone number.
 */
export function isDigitLabel(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^[+-]?\d{16,}$/.test(text) || /^\+\d{7,}$/.test(text);
}

/**
 * True when every value is numeric AND none of them looks like an identifier.
 * One identifier is enough to disqualify the whole column: it is a code list
 * even if most entries happen to parse as numbers.
 */
export function isNumericColumn(
  values: unknown[],
  toNumber: (value: unknown) => number = (v) => {
    const shape = classifyNumber(String(v));
    return shape ? (shape.kind === 'open' ? shape.asDecimal : shape.value) : NaN;
  }
): boolean {
  if (values.length === 0) return false;
  if (values.some(v => looksLikeIdentifier(v) || isDigitLabel(v))) return false;
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

/**
 * What people type into a number or date cell to say there is no value.
 *
 * In a column that is otherwise numbers or dates these are imported as empty,
 * and the import says how many. They are not recognised in text columns, where
 * "Unknown" is an answer in its own right and is kept as written.
 */
const MISSING_MARKERS = new Set([
  'na', 'n/a', 'n.a.', 'n.a', '#n/a', 'nan', 'null', 'none', 'nil', 'missing',
  'unknown', 'unk', 'not known', 'not available', 'not applicable', 'not recorded',
  'nd', '.', '-', '--', '?',
  // French, Spanish, Portuguese
  'inconnu', 'inconnue', 'non disponible', 'desconocido', 'desconocida', 'desconhecido', 'desconhecida',
]);

export function isMissingMarker(value: unknown): boolean {
  return typeof value === 'string' && MISSING_MARKERS.has(value.trim().toLowerCase());
}

const YES_NO_WORDS = new Set(['yes', 'no', 'y', 'n', 'true', 'false', 'oui', 'non', 'si', 'sí', 'sim', 'não', 'nao']);

/**
 * Whether a text column reads as a set of categories rather than free text.
 *
 * A yes/no column always does. Otherwise a column does when it has few
 * distinct values and they repeat, which separates sex, outcome and district
 * from names, notes and IDs.
 */
export function looksCategorical(values: string[]): boolean {
  if (values.length === 0) return false;
  const distinct = new Set(values.map(v => v.trim().toLowerCase()));
  if ([...distinct].every(v => YES_NO_WORDS.has(v))) return true;
  return distinct.size <= 12 && distinct.size * 2 <= values.length;
}
