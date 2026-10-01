/**
 * Axis scales and number formatting shared by the Visualize charts.
 *
 * Each chart used to carry its own "nice maximum" and its own formatter, and
 * they had drifted into four separate faults:
 *
 *  - Every scale assumed its data was positive. A mean weight-for-height
 *    z-score is negative for every group in a nutrition survey, and the bar
 *    chart drew an axis from 0 to 10 with no bars on it at all.
 *  - The maximum was rounded up to 1, 2, 5 or 10 times a power of ten and then
 *    cut into five, so a count axis whose maximum was 2 read 0, 0.4, 0.8, and
 *    a maximum of 52 ran the axis to 100.
 *  - Values were printed with one decimal whatever their size, so an attack
 *    rate of 0.03 was labelled "0.0" on an axis reading 0, 0.0, 0.0, 0.0, 0.1.
 *  - Some charts grouped thousands with the browser's locale, some did not
 *    group at all, and none used the number format chosen in the app.
 */

export interface NumberSeparators {
  decimalSeparator: string;
  thousandsSeparator: string;
}

const DEFAULT_SEPARATORS: NumberSeparators = { decimalSeparator: '.', thousandsSeparator: ',' };

export interface NiceScale {
  /** Lower end of the axis, a multiple of `step`. */
  min: number;
  /** Upper end of the axis, a multiple of `step`. */
  max: number;
  step: number;
  /** Every tick from min to max inclusive. */
  ticks: number[];
  /** Decimal places needed to print a tick exactly. */
  decimals: number;
}

export interface NiceScaleOptions {
  /** The values are counts, so a tick may not fall between two whole numbers. */
  integer?: boolean;
  /** Extend the axis to include zero. True for anything drawn as a length from a baseline. */
  includeZero?: boolean;
  /** Most intervals the axis may be cut into. */
  maxIntervals?: number;
}

/** Undo the binary noise that multiplying a step leaves behind (0.30000000000000004). */
function tidy(value: number, decimals: number): number {
  const rounded = Number(value.toFixed(Math.min(decimals + 2, 12)));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Decimal places needed to print a multiple of `step` without rounding it. */
export function decimalsForStep(step: number): number {
  if (!isFinite(step) || step <= 0) return 0;
  for (let d = 0; d <= 8; d++) {
    const scaled = step * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, scaled)) return d;
  }
  return 8;
}

/**
 * An axis that covers the data with round tick values.
 *
 * The step is the smallest of 1, 2, 2.5 or 5 times a power of ten that cuts the
 * axis into no more than `maxIntervals` pieces, so the axis stops at the first
 * round value past the data rather than at the next power-of-ten milestone.
 */
export function niceScale(dataMin: number, dataMax: number, options: NiceScaleOptions = {}): NiceScale {
  const { integer = false, includeZero = true, maxIntervals = 6 } = options;

  let lo = isFinite(dataMin) ? dataMin : 0;
  let hi = isFinite(dataMax) ? dataMax : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    // A single value has no extent to scale. Open a unit either side of it, or
    // above zero when the axis starts there.
    if (includeZero && lo === 0) hi = 1;
    else {
      const pad = integer ? 1 : Math.abs(lo) * 0.1 || 1;
      lo -= pad;
      hi += pad;
    }
  }

  const range = hi - lo;
  let exponent = Math.floor(Math.log10(range / maxIntervals));
  const multipliers = [1, 2, 2.5, 5];

  for (let guard = 0; guard < 6; guard++, exponent++) {
    const magnitude = Math.pow(10, exponent);
    for (const multiplier of multipliers) {
      const step = multiplier * magnitude;
      if (integer && (step < 1 || Math.abs(step - Math.round(step)) > 1e-9)) continue;
      const min = Math.floor(lo / step + 1e-9) * step;
      const max = Math.ceil(hi / step - 1e-9) * step;
      const intervals = Math.round((max - min) / step);
      if (intervals > maxIntervals) continue;

      const decimals = decimalsForStep(step);
      const ticks: number[] = [];
      for (let i = 0; i <= intervals; i++) ticks.push(tidy(min + i * step, decimals));
      return { min: ticks[0], max: ticks[ticks.length - 1], step: tidy(step, decimals), ticks, decimals };
    }
  }

  // Unreachable for finite input; kept so a caller always receives an axis.
  return { min: lo, max: hi, step: range, ticks: [lo, hi], decimals: decimalsForStep(range) };
}

/**
 * Decimal places to print a set of plotted values with.
 *
 * Whole numbers print whole. Otherwise one decimal is enough once the largest
 * value reaches 1, and below that the count grows so the largest value keeps
 * two significant figures: a column of rates near 0.03 prints as 0.031, 0.046
 * rather than as a column of "0.0". One setting per chart, so every label on
 * it lines up.
 */
export function decimalsForValues(values: number[]): number {
  const finite = values.filter(v => isFinite(v));
  if (finite.length === 0 || finite.every(v => Number.isInteger(v))) return 0;
  const largest = Math.max(...finite.map(v => Math.abs(v)));
  if (largest >= 1 || largest === 0) return 1;
  return Math.min(6, 1 - Math.floor(Math.log10(largest)));
}

/**
 * Print a number with a fixed number of decimals, using the separators chosen
 * in the app's locale settings rather than the browser's.
 */
export function formatFixed(
  value: number,
  decimals: number,
  separators: NumberSeparators = DEFAULT_SEPARATORS,
): string {
  if (!isFinite(value)) return '';
  const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(decimals, 20)));
  const [whole, fraction] = fixed.split('.');
  // A plain space would be collapsed or wrapped by a renderer; a no-break
  // space keeps the group attached to its number.
  const groupMark = separators.thousandsSeparator === ' ' ? ' ' : separators.thousandsSeparator;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
  const body = fraction ? `${grouped}${separators.decimalSeparator}${fraction}` : grouped;
  // -0.04 at one decimal is "0.0", not "-0.0".
  const isZero = Number(fixed) === 0;
  return value < 0 && !isZero ? `-${body}` : body;
}

/** Print an axis tick with exactly the decimals its scale needs. */
export function formatTick(
  value: number,
  scale: Pick<NiceScale, 'decimals'>,
  separators?: NumberSeparators,
  suffix = '',
): string {
  return `${formatFixed(value, scale.decimals, separators)}${suffix}`;
}

/** Median of a non-empty list. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Whole-number percentages for a waffle grid, which has exactly `total`
 * squares to hand out. Largest-remainder rounding, so the squares always sum
 * to the grid. These are square counts and not the percentages to print: three
 * equal thirds come back as 34, 33 and 33.
 */
export function allocateSquares(shares: number[], total = 100): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum <= 0) return shares.map(() => 0);
  const exact = shares.map(s => (s / sum) * total);
  const floored = exact.map(e => Math.floor(e + 1e-9));
  let remaining = total - floored.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((e, index) => ({ index, remainder: e - floored[index] }))
    .sort((a, b) => (b.remainder - a.remainder) || (a.index - b.index));
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    floored[index]++;
    remaining--;
  }
  return floored;
}
