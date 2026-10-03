/**
 * Deciding who is exposed, who they are compared with, and who is a case.
 *
 * The 2×2 panel and the forest plot each carried their own copy of this, and
 * the copies had drifted: the forest plot counted a missing outcome as "not
 * ill" and compared the exposed against everyone else, so the two tabs printed
 * different risk ratios for the same exposure.
 *
 * Both copies also shared one fault that inverted results outright. When no
 * value was literally "yes", "true" or "1", the alphabetically first value was
 * taken as "exposed". For Y/N, Oui/Non, Si/No and Sim/Não that is the
 * unexposed group, so a risk ratio of 4.5 was reported as 0.22 and described
 * as protective. Here a value is only chosen when it is recognised; otherwise
 * nothing is chosen and the caller has to ask.
 *
 * Values are compared after trimming and case-folding, so "Yes", "yes" and
 * "Yes " are one level rather than three. Untrimmed, a trailing space made a
 * third level and those records dropped out of the table without notice.
 */
import type { CaseRecord, DataColumn } from '../types/analysis';
import type { TwoByTwoTable } from './statistics';
import { pickOutcomeColumn } from './caseDefinition';
import { normalizedText, sortCategoryValues } from './recordFilter';

/** The identity of a cell's value for grouping: '' when missing. */
export function levelKey(value: unknown): string {
  return normalizedText(value).replace(/\s+/g, ' ').toLowerCase();
}

export interface ValueLevel {
  /** Trimmed, case-folded identity. Saved settings are matched on this. */
  key: string;
  /** The most common spelling, for display and for saving. */
  label: string;
  count: number;
}

/** Every distinct non-missing level of a column, in display order. */
export function collectLevels(records: CaseRecord[], column: string): ValueLevel[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const record of records) {
    const text = normalizedText(record[column]);
    if (text === '') continue;
    const key = levelKey(text);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { count: 0, spellings: new Map() };
      byKey.set(key, entry);
    }
    entry.count++;
    entry.spellings.set(text, (entry.spellings.get(text) || 0) + 1);
  }

  const levels: ValueLevel[] = [];
  for (const [key, entry] of byKey) {
    let label = key;
    let best = 0;
    for (const [spelling, n] of entry.spellings) {
      if (n > best) {
        best = n;
        label = spelling;
      }
    }
    levels.push({ key, label, count: entry.count });
  }

  const order = new Map(sortCategoryValues(levels.map(l => l.label)).map((label, i) => [label, i]));
  return levels.sort((a, b) => (order.get(a.label) ?? 0) - (order.get(b.label) ?? 0));
}

/** Find a level from a saved or typed value, whatever its case or spacing. */
export function findLevel(levels: ValueLevel[], value: string | null | undefined): ValueLevel | null {
  if (value === null || value === undefined) return null;
  const key = levelKey(value);
  if (key === '') return null;
  return levels.find(l => l.key === key) ?? null;
}

/** Lower-cased, accents removed, so "Não" and "nao" read alike when matching. */
function fold(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’`]/g, "'")
    .replace(/[.!]+$/, '')
    .trim();
}

const POSITIVE_VALUES = new Set([
  'yes', 'oui', 'si', 'sim', 'ja', 'true', 'vrai', 'verdadero', 'verdadeiro',
  'exposed', 'expose', 'exposee', 'expuesto', 'expuesta', 'exposto', 'exposta',
  'positive', 'positif', 'positivo', 'positiva', 'pos',
  'ate', 'eaten', 'present', 'да', 'نعم',
]);

const NEGATIVE_VALUES = new Set([
  'no', 'non', 'nao', 'nein', 'false', 'faux', 'falso',
  'unexposed', 'not exposed', 'non expose', 'non exposee', 'no expuesto',
  'no expuesta', 'nao exposto', 'nao exposta',
  'negative', 'negatif', 'negativo', 'negativa', 'neg',
  'none', 'never', 'absent', 'aucun', 'aucune', 'ninguno', 'ninguna', 'nenhum',
  'nenhuma', 'jamais', 'nunca', 'нет', 'لا',
]);

/** "Did not eat", "Not vaccinated", "Pas mangé", "No comió". */
const NEGATIVE_PREFIX = /^(no|not|non|never|did not|didn't|didnt|pas|sin|sem|nao|nunca|jamais)[\s\-_]/;

const MISSING_LIKE_VALUES = new Set([
  'unknown', 'unk', 'unkn', 'uk', 'dk', "don't know", 'dont know', 'do not know',
  'not known', 'not sure', 'unsure', 'na', 'n/a', 'n.a', 'nan', 'null', 'missing',
  'refused', 'not stated', 'not recorded', 'not available', 'not applicable',
  'nd', '?', '-', '--', '.',
  'inconnu', 'inconnue', 'ne sait pas', 'nsp', 'non renseigne',
  'desconocido', 'desconocida', 'no sabe', 'ns', 'ns/nr', 'se desconoce',
  'ignorado', 'ignorada', 'desconhecido', 'desconhecida', 'nao sabe',
  'sem informacao',
]);

/**
 * True for a level that records the absence of an answer rather than an
 * answer: "Unknown", "N/A", "Don't know". Such a level must never become the
 * comparison group by default.
 */
export function isMissingLikeLevel(key: string): boolean {
  return MISSING_LIKE_VALUES.has(fold(key));
}

type Coding = 'positive' | 'negative' | 'missing' | 'other';

/**
 * How each level reads. Single letters and 1/0 are only trusted as a pair:
 * "F" is false beside "T" but female beside "M", and "1" is exposed beside
 * "0" but a household size beside "2", "3" and "4".
 */
function classifyLevels(levels: ValueLevel[]): Map<string, Coding> {
  const folded = levels.map(l => fold(l.key));
  const present = new Set(folded);
  const hasYesLetter = present.has('y') || present.has('o') || present.has('s');
  const hasTrueLetter = present.has('t') || present.has('v');
  const binaryDigits = present.has('0') && present.has('1') && levels.length <= 3;

  const result = new Map<string, Coding>();
  levels.forEach((level, i) => {
    const text = folded[i];
    let coding: Coding = 'other';
    if (MISSING_LIKE_VALUES.has(text)) coding = 'missing';
    else if (POSITIVE_VALUES.has(text)) coding = 'positive';
    else if (NEGATIVE_VALUES.has(text) || NEGATIVE_PREFIX.test(text)) coding = 'negative';
    else if ((text === 'y' || text === 'o' || text === 's') && present.has('n')) coding = 'positive';
    else if (text === 'n' && hasYesLetter) coding = 'negative';
    else if ((text === 't' || text === 'v') && present.has('f')) coding = 'positive';
    else if (text === 'f' && hasTrueLetter) coding = 'negative';
    else if (text === '1' && binaryDigits) coding = 'positive';
    else if (text === '0' && binaryDigits) coding = 'negative';
    result.set(level.key, coding);
  });

  // A pair such as Vaccinated / Unvaccinated or Vacciné / Non vacciné, where
  // one value is the other with a negating prefix.
  const real = levels.filter(l => result.get(l.key) !== 'missing');
  if (real.length === 2 && real.every(l => result.get(l.key) === 'other')) {
    const [x, y] = real.map(l => fold(l.key));
    const negates = (neg: string, pos: string) =>
      ['un', 'non', 'non-', 'non ', 'not ', 'no ', 'in', 'im'].some(prefix => neg === prefix + pos);
    if (negates(x, y)) {
      result.set(real[0].key, 'negative');
      result.set(real[1].key, 'positive');
    } else if (negates(y, x)) {
      result.set(real[1].key, 'negative');
      result.set(real[0].key, 'positive');
    }
  }
  return result;
}

/**
 * The level that means "exposed", or null when that cannot be told.
 *
 * Null is a real answer. The caller shows no result and asks, because a wrong
 * guess here does not look wrong: it produces a clean, inverted estimate.
 */
export function detectExposedLevel(levels: ValueLevel[]): ValueLevel | null {
  const coding = classifyLevels(levels);
  // Several affirmative spellings in one column (Yes and y, before the data
  // are cleaned) all point the same way, so the commonest is taken. The others
  // are left out of the table, and callers report how many records that is.
  const positives = levels
    .filter(l => coding.get(l.key) === 'positive')
    .sort((a, b) => b.count - a.count);
  if (positives.length > 0) return positives[0];

  // Nothing reads as "yes", but in a two-level variable one clear "no" settles
  // it: Swam / No, Ate / Did not eat.
  const real = levels.filter(l => coding.get(l.key) !== 'missing');
  if (real.length === 2) {
    const negatives = real.filter(l => coding.get(l.key) === 'negative');
    if (negatives.length === 1) return real.find(l => l !== negatives[0]) ?? null;
  }
  return null;
}

/**
 * The comparison ("unexposed") level for a given exposed level, or null when
 * the only candidates are missing-like and the user has to choose.
 *
 * A recognised "no" wins. Otherwise the most common remaining level is used,
 * but never one that means unknown: the previous rule took the most common
 * level whatever it was, so "Unknown" became the "Not Exposed" column whenever
 * it outnumbered the real unexposed group.
 */
export function detectReferenceLevel(levels: ValueLevel[], exposedKey: string): ValueLevel | null {
  const coding = classifyLevels(levels);
  const candidates = levels.filter(l => l.key !== exposedKey && coding.get(l.key) !== 'missing');
  if (candidates.length === 0) return null;
  const byCount = (a: ValueLevel, b: ValueLevel) => b.count - a.count;
  const negatives = candidates.filter(l => coding.get(l.key) === 'negative').sort(byCount);
  if (negatives.length > 0) return negatives[0];
  return [...candidates].sort(byCount)[0];
}

export interface ExposureSetup {
  levels: ValueLevel[];
  exposed: ValueLevel | null;
  reference: ValueLevel | null;
}

/**
 * The exposed and comparison levels for one exposure variable: the saved
 * choice where there is one and it still exists in the data, otherwise
 * whatever can be recognised.
 */
export function resolveExposureSetup(
  records: CaseRecord[],
  column: string,
  savedExposed?: string | null,
  savedReference?: string | null
): ExposureSetup {
  const levels = collectLevels(records, column);
  const exposed = findLevel(levels, savedExposed) ?? detectExposedLevel(levels);
  if (!exposed) return { levels, exposed: null, reference: null };

  let reference = findLevel(levels, savedReference);
  if (!reference || reference.key === exposed.key) {
    reference = detectReferenceLevel(levels, exposed.key);
  }
  return { levels, exposed, reference };
}

/** Case values as chosen or saved, in the form records are compared against. */
export function caseKeySet(caseValues: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const value of caseValues) {
    const key = levelKey(value);
    if (key !== '') keys.add(key);
  }
  return keys;
}

export interface TwoByTwoCounts {
  table: TwoByTwoTable;
  /** Records left out because the exposure was blank. */
  missingExposure: number;
  /** Records left out because the outcome was blank. */
  missingOutcome: number;
  /** Records in a level that is neither the exposed nor the comparison level. */
  otherLevels: number;
}

/**
 * Count the four cells. A record is used only if its exposure is the exposed
 * or the comparison level and its outcome is present; everything else is
 * counted as excluded so the caller can say so.
 */
export function tabulateTwoByTwo(
  records: CaseRecord[],
  exposureVar: string,
  exposedKey: string,
  referenceKey: string,
  outcomeVar: string,
  caseKeys: ReadonlySet<string>
): TwoByTwoCounts {
  let a = 0, b = 0, c = 0, d = 0;
  let missingExposure = 0, missingOutcome = 0, otherLevels = 0;

  for (const record of records) {
    const exposure = levelKey(record[exposureVar]);
    if (exposure === '') {
      missingExposure++;
      continue;
    }
    const outcome = levelKey(record[outcomeVar]);
    if (outcome === '') {
      missingOutcome++;
      continue;
    }
    if (exposure !== exposedKey && exposure !== referenceKey) {
      otherLevels++;
      continue;
    }

    const exposed = exposure === exposedKey;
    const diseased = caseKeys.has(outcome);
    if (exposed && diseased) a++;
    else if (exposed) b++;
    else if (diseased) c++;
    else d++;
  }

  return { table: { a, b, c, d }, missingExposure, missingOutcome, otherLevels };
}

/**
 * Columns that can define the outcome: not dates, identifiers or coordinates,
 * and with 2 to 20 distinct values.
 *
 * Numeric columns used to be excluded unless their key contained "age", so an
 * outcome coded 1/0 could not be selected at all and the panel sat on "Define
 * the outcome variable" with an empty list.
 */
export function outcomeCandidateColumns(columns: DataColumn[], records: CaseRecord[]): DataColumn[] {
  return columns.filter(col => {
    if (col.type === 'date') return false;
    if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
    if (col.key.includes('latitude') || col.key.includes('longitude')) return false;

    const uniqueValues = new Set(records.map(r => r[col.key])).size;
    return uniqueValues >= 2 && uniqueValues <= 20;
  });
}

/** The outcome column and case values to pre-select, or null to ask the user. */
export function suggestOutcome(
  columns: DataColumn[],
  records: CaseRecord[]
): { key: string; caseValues: string[] } | null {
  return pickOutcomeColumn(
    outcomeCandidateColumns(columns, records).map(col => ({
      key: col.key,
      label: col.label,
      values: collectLevels(records, col.key).map(level => level.label),
    }))
  );
}

/**
 * The measure a forest plot should open with, from the study design saved in
 * the 2×2 analysis: odds ratios for a case-control design, risk ratios for a
 * cohort design or when nothing has been saved. The plot used to open on odds
 * ratios regardless, so the outbreak sample, a cohort study, showed an OR of
 * 15 here and an RR of 4.5 in the 2×2 tab with nothing to say why.
 */
export function defaultForestMeasure(studyDesign: unknown): 'riskRatio' | 'oddsRatio' {
  return studyDesign === 'case-control' ? 'oddsRatio' : 'riskRatio';
}

/**
 * How to refer to an outcome in a title: "illness" for the usual case/illness
 * column, otherwise the column's own label.
 */
export function outcomeNoun(outcomeLabel: string): string {
  return /\b(ill|illness|sick|case|cases|malade|cas|caso|enfermo|doente)\b/i.test(outcomeLabel)
    ? 'illness'
    : outcomeLabel.trim() || 'the outcome';
}
