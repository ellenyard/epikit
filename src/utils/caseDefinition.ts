/**
 * Deciding which values of an outcome column mean "case".
 *
 * The previous rule tested whether a value contained any of 'yes', 'confirmed',
 * 'probable', 'suspected', 'positive' or 'case'. The last of those matches the
 * negation of itself: "Not a case" contains "case", so the default case
 * definition included the people who were explicitly not cases.
 *
 * That is silent. Every record becomes a case, so no unexposed-well or
 * exposed-well cell has anyone in it, and the resulting odds ratios are
 * meaningless without looking wrong. It applied to the 2x2 panel and the forest
 * plot alike, both of which are the tools an investigator reaches for to decide
 * what caused an outbreak.
 *
 * Negation is therefore checked first and wins. The asymmetry is deliberate:
 * missing a real case value costs a tick in the interface, which the user can
 * see and correct, while admitting a non-case corrupts every estimate quietly.
 */

/**
 * Words that mean this value is not a case, whatever else it contains.
 * "Discarded" and "ruled out" are the terms used in measles and AFP
 * surveillance respectively.
 */
const NEGATION_PATTERN =
  /(^|[\s\-_/(])(not|non|no|never|negative|excluded|discarded|control|ruled[\s\-_]*out|unlikely)([\s\-_/)]|$)/i;

/** Words that mean this value is a case, absent any negation. */
const CASE_KEYWORDS = [
  'confirmed', 'probable', 'suspected', 'suspect', 'positive', 'case', 'yes', 'ill',
];

/** True when the value explicitly denies being a case. */
export function readsAsNonCase(value: string): boolean {
  return NEGATION_PATTERN.test(value.trim());
}

/**
 * The values that should be ticked as "case" by default.
 *
 * Returns an empty array when nothing matches, so the caller can leave the
 * selection empty and require a choice rather than inventing one.
 */
export function detectCaseValues(values: string[]): string[] {
  return values.filter(value => {
    // A blank needs no guard of its own: it contains no case keyword.
    const text = value.trim().toLowerCase();
    if (readsAsNonCase(text)) return false;
    return CASE_KEYWORDS.some(keyword => text.includes(keyword));
  });
}
