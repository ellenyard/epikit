/**
 * Deciding which values of an outcome column mean "case", and which column is
 * the outcome in the first place.
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
 *
 * Matching on substrings had the same fault in two more places. "Unconfirmed"
 * contains "confirmed" and "Improbable" contains "probable", so both were
 * ticked as cases; and the outcome column was chosen by whether its name
 * contained "ill", which picked "ville" and "village" and then ticked
 * Brazzaville and Libreville as the cases. Everything here now matches whole
 * words only.
 */

/** Lower-cased with accents removed, so "Confirmé" and "confirme" read alike. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** The words of a value or a column name. camelCase and snake_case both split. */
function words(text: string): string[] {
  return fold(text.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Words that mean this value is not a case, whatever else it contains.
 * "Discarded" and "ruled out" are the terms used in measles and AFP
 * surveillance respectively. French, Spanish and Portuguese equivalents are
 * included because a negation missed is a non-case counted as a case.
 */
const NEGATION_WORDS = new Set([
  'not', 'non', 'no', 'never', 'negative', 'excluded', 'discarded', 'control',
  'unlikely', 'unconfirmed', 'improbable', 'noncase',
  // French
  'pas', 'sans', 'negatif', 'ecarte', 'ecartee', 'exclu', 'exclue',
  'temoin', 'controle', 'infirme', 'infirmee',
  // Spanish and Portuguese
  'sin', 'sem', 'nao', 'negativo', 'negativa', 'descartado', 'descartada',
  'excluido', 'excluida', 'testigo',
]);

/** Words that mean this value is a case, absent any negation. */
const CASE_WORDS = new Set([
  'confirmed', 'probable', 'suspected', 'suspect', 'positive', 'case', 'yes',
  'ill', 'sick',
  // French
  'confirme', 'confirmee', 'suspecte', 'suspectee', 'positif', 'cas', 'malade',
  'oui',
  // Spanish and Portuguese
  'confirmado', 'confirmada', 'provavel', 'sospechoso', 'sospechosa',
  'suspeito', 'suspeita', 'positivo', 'positiva', 'caso', 'enfermo', 'enferma',
  'doente',
]);

/**
 * Values that are a bare "yes". Only matched against the whole value: "y" is
 * "and" in Spanish and "si" is "if" in French, so neither can be trusted as
 * one word among several.
 */
const AFFIRMATIVE_VALUES = new Set(['y', 'true', '1', 'si', 'sim']);

/** True when the value explicitly denies being a case. */
export function readsAsNonCase(value: string): boolean {
  const parts = words(value);
  if (parts.some(word => NEGATION_WORDS.has(word))) return true;
  return parts.some((word, i) => word === 'ruled' && parts[i + 1] === 'out')
    || parts.includes('ruledout');
}

/**
 * The values that should be ticked as "case" by default.
 *
 * Returns an empty array when nothing matches, so the caller can leave the
 * selection empty and require a choice rather than inventing one.
 */
export function detectCaseValues(values: string[]): string[] {
  return values.filter(value => {
    // A blank needs no guard of its own: it contains no case word.
    if (readsAsNonCase(value)) return false;
    if (AFFIRMATIVE_VALUES.has(fold(value))) return true;
    return words(value).some(word => CASE_WORDS.has(word));
  });
}

/** Column-name words that say the column records who is a case. */
const OUTCOME_NAME_WORDS = new Set([
  'ill', 'illness', 'sick', 'case', 'malade', 'cas', 'caso', 'enfermo',
  'enferma', 'doente',
  // Names written as one word, which the word split cannot separate.
  'casestatus', 'caseclassification', 'casedefinition', 'iscase',
]);

/**
 * Names that are the outcome only when they are the whole name. "status" and
 * "outcome" inside a longer name are usually something else: vaccination
 * status, pregnancy outcome.
 */
const OUTCOME_WHOLE_NAMES = new Set(['status', 'outcome', 'classification']);

/**
 * Words that turn an outcome-sounding name into something else: "contact with
 * case" and "ill family member" are exposures, "case id" is an identifier.
 */
const NOT_OUTCOME_WORDS = new Set([
  'contact', 'contacts', 'index', 'source', 'family', 'household', 'relative',
  'member', 'id', 'number', 'date', 'onset',
]);

/** True when a column's key or label names it as the case/illness variable. */
export function looksLikeOutcomeColumn(name: string): boolean {
  const parts = words(name);
  if (parts.length === 1 && OUTCOME_WHOLE_NAMES.has(parts[0])) return true;
  if (parts.some(word => NOT_OUTCOME_WORDS.has(word))) return false;
  return parts.some(word => OUTCOME_NAME_WORDS.has(word));
}

export interface OutcomeCandidate {
  key: string;
  label: string;
  /** The column's distinct non-blank values. */
  values: string[];
}

/**
 * The outcome column to pre-select, with its default case values, or null.
 *
 * A column is only chosen when its name says so in whole words and its values
 * split into recognisable cases and non-cases. Anything less is a guess, and a
 * wrong guess here runs every analysis against the wrong outcome, so null is
 * returned and the interface asks.
 */
export function pickOutcomeColumn(
  candidates: OutcomeCandidate[]
): { key: string; caseValues: string[] } | null {
  for (const candidate of candidates) {
    if (!looksLikeOutcomeColumn(candidate.key) && !looksLikeOutcomeColumn(candidate.label)) continue;
    const values = candidate.values.filter(v => v.trim() !== '');
    const caseValues = detectCaseValues(values);
    if (caseValues.length > 0 && caseValues.length < values.length) {
      return { key: candidate.key, caseValues };
    }
  }
  return null;
}
