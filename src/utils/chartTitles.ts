/**
 * Automatic chart titles that read as a sentence.
 *
 * The charts built their titles from the statistic and the column labels as
 * they stood, which gave "Sum of Cases Reported by District" and "Mean of WHZ
 * Score by Age Group": a formula, not a title. A total of a count column is
 * called by the column's name, a mean is "Mean WHZ score", and column labels
 * drop their title-case capitals once they sit inside a sentence.
 */

/**
 * A column label as it reads inside a sentence: "Age Group" becomes "age
 * group" and "WHZ Score" becomes "WHZ score". Only a word written with one
 * capital and the rest in lower case is changed; an acronym, a single letter
 * ("Vitamin A") and a word with a capital inside it are left alone.
 */
export function labelInSentence(label: string): string {
  return label.replace(/\b\p{Lu}\p{Ll}+\b/gu, word => word.toLowerCase());
}

/** The first character capitalised, the rest untouched. */
export function sentenceStart(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

export type TitleStatistic = 'count' | 'sum' | 'mean' | 'median';

export interface StatisticWords {
  /** How the values were summarised. */
  statistic: TitleStatistic;
  /** The column summarised, outside count mode. */
  valueLabel?: string;
  /** The column is a count of cases, so its total is called by its name. */
  isCountColumn?: boolean;
  /** What a counted record is called: "Records" by default. */
  countNoun?: string;
}

/**
 * What the values are, as the subject of a title: "Records", "Cases Reported",
 * "Total Deaths", "Mean WHZ Score". The column label keeps its own case here;
 * `chartTitle` lowers it once the phrase is in a sentence.
 */
export function statisticPhrase({ statistic, valueLabel = '', isCountColumn = false, countNoun = 'Records' }: StatisticWords): string {
  if (statistic === 'count' || !valueLabel) return countNoun;
  if (statistic === 'sum') return isCountColumn ? valueLabel : `Total ${valueLabel}`;
  return `${statistic === 'mean' ? 'Mean' : 'Median'} ${valueLabel}`;
}

/**
 * "<Statistic> by <column> and <column>", in sentence case: "Cases reported by
 * district", "Mean WHZ score by age group and sex".
 */
export function chartTitle(subject: string, ...byLabels: string[]): string {
  const by = byLabels.filter(Boolean).map(labelInSentence);
  const body = by.length > 0 ? `${labelInSentence(subject)} by ${by.join(' and ')}` : labelInSentence(subject);
  return sentenceStart(body);
}
