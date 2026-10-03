/**
 * Default variable selection for the chart gallery.
 *
 * Shared by BarChart, DotPlot and LollipopChart, which previously each carried
 * their own copy. The copies had drifted: only one bounded the cardinality of
 * its last-resort fallback, so the others could auto-select a record-ID column
 * and try to draw one mark per record.
 *
 * The other charts opened blank, nine of the twelve, and asked for two or
 * three variables before drawing anything. The picks further down give each
 * of them a first drawing derived from the dataset, on the same rule as the
 * bar chart: a sensible choice or nothing, never something absurd.
 */

import type { Dataset, DataColumn } from '../types/analysis';
import { categoryColumns, categoriesInColumn, categoryOf, orderPeriods } from './chartCategories';

/**
 * Upper bound on distinct values for a column to be auto-selected as the
 * category axis.
 *
 * Columns commonly infer as 'text', and the first text column in a line list is
 * typically a case or record ID. Without this bound a 400-record import
 * auto-builds 400 marks and an SVG tens of thousands of pixels tall. The bound
 * applies to every branch of the search, including the fallback.
 */
export const MAX_AUTO_CATEGORIES = 30;

/**
 * Distinct categories in a column, counted the way the charts will draw them:
 * trimmed, with a whitespace-only cell as missing.
 */
function distinctCount(dataset: Dataset, key: string): number {
  const seen = new Set<string>();
  for (const record of dataset.records) {
    const category = categoryOf(record[key]);
    if (category !== null) seen.add(category);
  }
  return seen.size;
}

/**
 * Choose a category column: prefer a true grouping variable (a categorical
 * column with 3 to MAX_AUTO_CATEGORIES distinct values, e.g. Case Status) over
 * two-value columns like Sex, and over ID-like text columns entirely.
 *
 * @param exclude a column already taken by another slot of the chart.
 * @returns the column key, or '' when nothing is suitable, which leaves the
 *          picker showing its prompt rather than drawing something absurd.
 */
export function pickCategoryColumn(dataset: Dataset, exclude = ''): string {
  const inRange = (c: DataColumn, min: number) => {
    if (c.key === exclude) return false;
    const n = distinctCount(dataset, c.key);
    return n >= min && n <= MAX_AUTO_CATEGORIES;
  };

  const categoricals = dataset.columns.filter(c => c.type === 'categorical');
  const ideal = categoricals.find(c => inRange(c, 3));
  if (ideal) return ideal.key;

  const twoValue = categoricals.find(c => inRange(c, 2));
  if (twoValue) return twoValue.key;

  const plottableText = dataset.columns.find(c =>
    (c.type === 'text' || c.type === 'categorical' || c.type === 'boolean') && inRange(c, 2)
  );
  return plottableText?.key ?? '';
}

/** Choose a numeric column, or '' when the dataset has none. */
export function pickNumericColumn(dataset: Dataset): string {
  return dataset.columns.find(c => c.type === 'number')?.key ?? '';
}

/* -------------------------------------------------------------------------- */
/* First choices for the charts that take two or three variables              */
/* -------------------------------------------------------------------------- */

/** The words of a column's key and label, lower-cased. */
function nameTokens(column: DataColumn): string[] {
  return `${column.key} ${column.label}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter(Boolean);
}

function namedWith(column: DataColumn, words: Set<string>): boolean {
  return nameTokens(column).some(t => words.has(t));
}

/** Category columns with 2 to MAX_AUTO_CATEGORIES values, likeliest first. */
function plottableCategories(dataset: Dataset): DataColumn[] {
  return categoryColumns(dataset).filter(c => {
    const n = distinctCount(dataset, c.key);
    return n >= 2 && n <= MAX_AUTO_CATEGORIES;
  });
}

const SEX_WORDS = new Set(['sex', 'gender', 'sexe', 'sexo', 'genero', 'género']);

/**
 * A column with exactly two values, for the two sides of a pyramid or the
 * two series of a grouped bar chart. Sex is the usual one and is preferred by
 * name; otherwise the first two-value column that is not `exclude`.
 */
export function pickTwoValueColumn(dataset: Dataset, exclude = ''): string {
  const twoValued = plottableCategories(dataset).filter(c => c.key !== exclude && distinctCount(dataset, c.key) === 2);
  return (twoValued.find(c => namedWith(c, SEX_WORDS)) ?? twoValued[0])?.key ?? '';
}

const AGE_WORDS = new Set(['age', 'ages', 'agegroup', 'ageband', 'agegrp', 'âge', 'edad', 'idade', 'etario', 'etaria', 'faixa']);

/**
 * An age-band column: named for age and holding a handful of bands rather
 * than a number for every year of life. '' when there is none, since a
 * pyramid of anything else is not what the chart is for.
 */
export function pickAgeBandColumn(dataset: Dataset, exclude = ''): string {
  return plottableCategories(dataset)
    .find(c => c.key !== exclude && c.type !== 'number' && namedWith(c, AGE_WORDS))?.key ?? '';
}

/** Most series a grouped bar chart is opened with; more than this is a wall of colour. */
const MAX_AUTO_GROUPS = 6;

/**
 * Category and group for a grouped bar chart: a column with 3 to
 * MAX_AUTO_CATEGORIES values split by a two-value column such as sex or,
 * when there is none, by the column with the fewest values (a surveillance
 * extract has districts by disease). Both or neither.
 */
export function pickGroupedPair(dataset: Dataset): { category: string; group: string } {
  const none = { category: '', group: '' };
  const candidates = plottableCategories(dataset);
  const smallest = [...candidates]
    .filter(c => distinctCount(dataset, c.key) <= MAX_AUTO_GROUPS)
    .sort((a, b) => distinctCount(dataset, a.key) - distinctCount(dataset, b.key));
  const group = pickTwoValueColumn(dataset) || smallest[0]?.key || '';
  if (!group) return none;
  const category = candidates
    .find(c => c.key !== group && distinctCount(dataset, c.key) >= 3)?.key ?? '';
  return category ? { category, group } : none;
}

/**
 * Category and two-value column for a population pyramid: age bands by sex.
 * Both or neither.
 */
export function pickPyramidPair(dataset: Dataset): { category: string; group: string } {
  const category = pickAgeBandColumn(dataset);
  const group = category ? pickTwoValueColumn(dataset, category) : '';
  return category && group ? { category, group } : { category: '', group: '' };
}

const TARGET_WORDS = new Set(['target', 'goal', 'benchmark', 'cible', 'objectif', 'meta', 'objetivo']);

/** A label reduced to its words, for matching one column's name against another's. */
function labelWords(column: DataColumn, drop: Set<string>): string {
  return (column.label || column.key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .filter(t => t && !drop.has(t))
    .join(' ');
}

/**
 * A numeric column named as a target and the column it is the target for:
 * "Target Vitamin A Coverage (%)" with "Vitamin A Coverage (%)", or "Target
 * Completeness (%)" with "Reporting Completeness (%)". The measured column
 * must be the only one that matches once the word "target" is set aside.
 * Nothing is guessed when there is no such pair.
 */
export function pickTargetPair(dataset: Dataset): { actual: string; target: string } {
  const numeric = dataset.columns.filter(c => c.type === 'number');
  const targets = numeric.filter(c => namedWith(c, TARGET_WORDS));
  const measured = numeric.filter(c => !targets.includes(c));
  for (const target of targets) {
    const base = labelWords(target, TARGET_WORDS);
    if (!base) continue;
    const exact = measured.filter(c => labelWords(c, TARGET_WORDS) === base);
    const partial = measured.filter(c => ` ${labelWords(c, TARGET_WORDS)} `.includes(` ${base} `));
    const match = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
    if (match) return { actual: match.key, target: target.key };
  }
  return { actual: '', target: '' };
}

const PLACE_WORDS = new Set([
  'district', 'region', 'province', 'county', 'state', 'area', 'zone', 'facility', 'site', 'location',
  'ward', 'village', 'neighborhood', 'neighbourhood', 'commune', 'department', 'departamento', 'distrito',
  'région', 'provincia', 'municipio', 'subcounty', 'woreda', 'kebele', 'lga',
]);
/** Periods of time, finest first: the finer the period, the more a heatmap's columns show of a season. */
const TIME_WORDS_BY_GRAIN: Set<string>[] = [
  new Set(['month', 'mois', 'mes']),
  new Set(['week', 'epiweek', 'semaine', 'semana']),
  new Set(['quarter', 'trimestre']),
  new Set(['year', 'period', 'annee', 'année', 'año', 'ano', 'periode', 'période', 'periodo']),
];
const TIME_WORDS = new Set(TIME_WORDS_BY_GRAIN.flatMap(words => [...words]));

/**
 * Two columns to cross-tabulate in a heatmap. A place by a time period when
 * the dataset has both, which is what a surveillance extract is for, with
 * the month ahead of the year so that the grid shows a season; else the
 * first two columns with three or more values; else the first two with two.
 */
export function pickHeatmapPair(dataset: Dataset): { row: string; col: string } {
  const none = { row: '', col: '' };
  const candidates = plottableCategories(dataset);
  const place = candidates.find(c => namedWith(c, PLACE_WORDS));
  const time = TIME_WORDS_BY_GRAIN
    .map(words => candidates.find(c => c !== place && namedWith(c, words)))
    .find(c => c !== undefined);
  if (place && time) return { row: place.key, col: time.key };

  // A place still makes the rows when there is one. Then declared
  // categories ahead of free text: a text column with few values is as
  // likely to be a time of day as a grouping.
  const byType = (c: DataColumn) => (c === place ? -1 : c.type === 'categorical' || c.type === 'boolean' ? 0 : 1);
  const ranked = [...candidates].sort((a, b) => byType(a) - byType(b));
  const rich = ranked.filter(c => c === place || distinctCount(dataset, c.key) >= 3);
  const pair = rich.length >= 2 ? rich : ranked;
  return pair.length >= 2 ? { row: pair[0].key, col: pair[1].key } : none;
}

/** Most categories a waffle can colour distinctly. */
export const MAX_WAFFLE_CATEGORIES = 8;

/** The first categorical column with 2 to MAX_WAFFLE_CATEGORIES values. */
export function pickWaffleColumn(dataset: Dataset): string {
  return plottableCategories(dataset)
    .find(c => c.type !== 'number' && distinctCount(dataset, c.key) <= MAX_WAFFLE_CATEGORIES)?.key ?? '';
}

const PERIOD_WORDS = new Set([
  'year', 'yr', 'period', 'round', 'phase', 'wave', 'survey', 'visit', 'timepoint',
  'annee', 'année', 'año', 'ano', 'periode', 'période', 'periodo', 'ronda', 'fase',
]);
const PERIOD_VALUE = /^(before|after|pre|post|baseline|endline|follow[\s-]?up|\d{4})\b/i;

/** Most values a column may have and still read as a set of periods. */
const MAX_PERIODS = 12;

/**
 * A column whose values are periods, with its earliest and latest value: the
 * two ends of a slope chart. Found by name (Year, Survey Round) or by values
 * (years, Before/After). '' when there is none: a slope chart of two
 * arbitrary categories would compare things that are not periods.
 */
export function pickPeriodColumn(dataset: Dataset): { column: string; start: string; end: string } {
  const none = { column: '', start: '', end: '' };
  for (const column of categoryColumns(dataset)) {
    const values = categoriesInColumn(dataset.records, column);
    if (values.length < 2 || values.length > MAX_PERIODS) continue;
    const byName = namedWith(column, PERIOD_WORDS);
    const byValue = values.every(v => PERIOD_VALUE.test(v));
    if (!byName && !byValue) continue;
    const ordered = orderPeriods(values, column);
    return { column: column.key, start: ordered[0], end: ordered[ordered.length - 1] };
  }
  return none;
}

/**
 * The category of a slope chart whose two ends are periods of `periodColumn`:
 * a place when there is one, else the first grouping column that is not
 * itself a period of time. Cases in 2022 against 2025 are compared by
 * district, not by quarter.
 */
export function pickSlopeCategory(dataset: Dataset, periodColumn: string): string {
  const candidates = plottableCategories(dataset).filter(c => c.key !== periodColumn && distinctCount(dataset, c.key) >= 3);
  const place = candidates.find(c => namedWith(c, PLACE_WORDS));
  const plain = candidates.find(c => !namedWith(c, TIME_WORDS) && !namedWith(c, PERIOD_WORDS));
  return (place ?? plain)?.key ?? pickCategoryColumn(dataset, periodColumn);
}

/** The first date column, or '' when the dataset has none. */
export function pickDateColumn(dataset: Dataset): string {
  return dataset.columns.find(c => c.type === 'date')?.key ?? '';
}

/**
 * Resolve the column a chart should actually use: the user's choice when it is
 * still valid for the current dataset, otherwise the automatic pick.
 *
 * Deriving this rather than syncing it in an effect means the selection cannot
 * lag the dataset by a render, and switching datasets re-picks automatically.
 */
export function resolveColumnChoice(
  dataset: Dataset,
  choice: string,
  auto: string,
  requireNumeric = false
): string {
  const valid = choice !== '' && dataset.columns.some(c =>
    c.key === choice && (!requireNumeric || c.type === 'number')
  );
  return valid ? choice : auto;
}

/**
 * True when a column's name says it holds a percentage or a rate. A category
 * with few records behind it is flagged by default for these, where a small
 * denominator makes the value unstable; a count of few records is simply a
 * small count, and flagging it faded most of the bars of a typical outbreak.
 */
export function looksLikeRate(label: string): boolean {
  return /%|\b(rate|rates|percent|percentage|pct|proportion|share|coverage|completeness|ratio|per)\b/i.test(label);
}
