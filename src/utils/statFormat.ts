/**
 * Number formatting for statistics that must not be rounded like estimates.
 *
 * Everything in the analysis tabs went through a three-significant-figure
 * formatter. That suits a risk ratio; it is wrong for values read straight off
 * the data. A minimum birth weight of 1005 g was shown as 1010, a year of
 * birth of 1987 as 1990 and a sum of 35330 as 35300: numbers that appear
 * nowhere in the dataset, shown as though they did.
 */

/** A value taken from the data, or a sum of them, written out in full. */
export function formatExact(n: number): string {
  if (!Number.isFinite(n)) return '-';
  // toPrecision(12) removes binary noise such as 0.1 + 0.2 = 0.30000000000000004
  // without touching any digit a dataset could carry.
  return String(Number(n.toPrecision(12)));
}

/** The most decimal places any of the values is recorded to, capped at 6. */
export function dataDecimals(values: number[]): number {
  let decimals = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const text = formatExact(v);
    if (text.includes('e')) continue;
    const point = text.indexOf('.');
    if (point >= 0) decimals = Math.max(decimals, text.length - point - 1);
  }
  return Math.min(decimals, 6);
}

/**
 * A derived summary (mean, SD, median, quartile) to a fixed number of decimal
 * places, with trailing zeros dropped. The usual convention is one more
 * decimal than the data were recorded to, which the caller supplies.
 */
export function formatSummary(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return '-';
  return String(Number(n.toFixed(Math.max(0, Math.min(decimals, 8)))));
}

/**
 * A p-value: "<0.001" below that, two decimals from 0.10 up, three otherwise.
 *
 * Rounding must never move a value across 0.05. A p of 0.0496 printed as
 * "0.050" beside the words "statistically significant" reads as a
 * contradiction, so more decimals are shown until the printed number falls on
 * the same side of 0.05 as the real one.
 */
export function formatPValue(p: number): string {
  if (!Number.isFinite(p)) return '-';
  if (p < 0.001) return '<0.001';
  let decimals = p >= 0.0995 ? 2 : 3;
  let text = p.toFixed(decimals);
  while (decimals < 6 && (Number(text) < 0.05) !== (p < 0.05)) {
    decimals++;
    text = p.toFixed(decimals);
  }
  return text;
}

/** "p = 0.043" or "p < 0.001", for use in a sentence. */
export function formatPValueText(p: number): string {
  const text = formatPValue(p);
  return text.startsWith('<') ? `p < ${text.slice(1)}` : `p = ${text}`;
}
