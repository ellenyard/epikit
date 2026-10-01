/**
 * Statistical Calculations for Epidemiological Analysis
 *
 * This module provides the core statistical functions used throughout LineList.
 * All calculations follow standard epidemiological methods and formulas.
 *
 * CONTENTS:
 *
 * 1. TWO-BY-TWO TABLE ANALYSIS (lines ~38-96)
 *    - Risk Ratio (Relative Risk) with 95% CI
 *    - Odds Ratio with 95% CI (Woolf method; Haldane-Anscombe 0.5 correction
 *      for zero cells, applied to both the point estimate and the CI)
 *    - Risk Difference with 95% CI
 *    - Attributable Risk Percent
 *    - Chi-square test (Yates' correction, clamped at zero so the correction
 *      never inflates the statistic when |O-E| < 0.5)
 *    - Fisher's exact test (two-sided), with the smallest expected count
 *      reported so callers can tell when it is the test to quote
 *
 * 2. CONFIDENCE INTERVAL CALCULATIONS (lines ~98-151)
 *    - Log-based methods for ratio measures (RR, OR)
 *    - Standard error methods for difference measures
 *
 * 3. STATISTICAL DISTRIBUTION FUNCTIONS (lines ~153-254)
 *    - Chi-square CDF (for p-value calculation)
 *    - Gamma function approximations
 *    - Log-gamma (Lanczos approximation)
 *
 * 4. FISHER'S EXACT TEST (lines ~256-297)
 *    - Hypergeometric distribution
 *    - Two-tailed exact test
 *
 * 5. DESCRIPTIVE STATISTICS (lines ~299-407)
 *    - Mean, median, mode
 *    - Standard deviation, variance
 *    - Quartiles, IQR
 *    - Five-number summary
 *
 * 6. FREQUENCY DISTRIBUTIONS (lines ~409-447)
 *    - Count and percent for categorical variables
 *    - Cumulative frequencies
 *
 * 7. CHI-SQUARE FOR R×C TABLES (lines ~449-676)
 *    - Group comparisons (R×2)
 *    - Full cross-tabulations (R×C)
 *
 * References:
 * - Rothman KJ, Greenland S, Lash TL. Modern Epidemiology. 3rd ed.
 * - CDC. Principles of Epidemiology in Public Health Practice. 3rd ed.
 */

// =============================================================================
// TWO-BY-TWO TABLE ANALYSIS
// The classic 2×2 contingency table for exposure-outcome relationships
// =============================================================================

export interface TwoByTwoTable {
  a: number; // Exposed + Disease
  b: number; // Exposed + No Disease
  c: number; // Not Exposed + Disease
  d: number; // Not Exposed + No Disease
}

export interface TwoByTwoResults {
  table: TwoByTwoTable;
  totalExposed: number;
  totalUnexposed: number;
  totalDisease: number;
  totalNoDisease: number;
  total: number;

  // Attack rates
  attackRateExposed: number;
  attackRateUnexposed: number;
  attackRateTotal: number;

  // Measures of association
  riskRatio: number;
  riskRatioCI: [number, number];
  oddsRatio: number;
  oddsRatioCI: [number, number];
  riskDifference: number;
  riskDifferenceCI: [number, number];
  attributableRiskPercent: number;

  /**
   * True when a cell is zero and the odds ratio and its interval were
   * calculated after adding 0.5 to every cell. The uncorrected ratio is 0 or
   * undefined, so a caller showing this number has to say what it is.
   */
  oddsRatioCorrected: boolean;

  // Statistical tests
  /** Chi-square with Yates' continuity correction. */
  chiSquare: number;
  chiSquarePValue: number;
  /** Two-sided. Null when a whole row or column of the table is empty. */
  fisherExactPValue: number | null;
  /**
   * Smallest expected cell count; NaN when a whole row or column is empty.
   * Below 5 the chi-square approximation is unreliable and Fisher's exact test
   * is the one to quote.
   */
  minExpectedCount: number;
}

export function calculateTwoByTwo(table: TwoByTwoTable): TwoByTwoResults {
  const { a, b, c, d } = table;

  const totalExposed = a + b;
  const totalUnexposed = c + d;
  const totalDisease = a + c;
  const totalNoDisease = b + d;
  const total = a + b + c + d;

  // Attack rates
  const attackRateExposed = totalExposed > 0 ? a / totalExposed : 0;
  const attackRateUnexposed = totalUnexposed > 0 ? c / totalUnexposed : 0;
  const attackRateTotal = total > 0 ? totalDisease / total : 0;

  // Risk Ratio (Relative Risk)
  // No continuity correction: RR is undefined (Infinity, rendered as
  // "Undefined") when the unexposed attack rate is 0, matching the CI below.
  const riskRatio = attackRateUnexposed > 0 ? attackRateExposed / attackRateUnexposed : Infinity;
  const riskRatioCI = calculateRiskRatioCI(a, b, c, d);

  // Odds Ratio
  // Haldane-Anscombe 0.5 correction when any cell is zero (Epi Info convention),
  // so the point estimate is consistent with the corrected CI below. When an
  // entire marginal total is zero the ratio is truly undefined (Infinity,
  // rendered as "Undefined").
  const hasZeroMarginal =
    totalExposed === 0 || totalUnexposed === 0 || totalDisease === 0 || totalNoDisease === 0;
  const hasZeroCell = a === 0 || b === 0 || c === 0 || d === 0;
  const oddsRatio = hasZeroMarginal
    ? Infinity
    : hasZeroCell
      ? ((a + 0.5) * (d + 0.5)) / ((b + 0.5) * (c + 0.5))
      : (a * d) / (b * c);
  const oddsRatioCI = calculateOddsRatioCI(a, b, c, d);

  // Risk Difference (Attributable Risk)
  const riskDifference = attackRateExposed - attackRateUnexposed;
  const riskDifferenceCI = calculateRiskDifferenceCI(a, b, c, d);

  // Attributable Risk Percent
  const attributableRiskPercent = attackRateExposed > 0
    ? ((attackRateExposed - attackRateUnexposed) / attackRateExposed) * 100
    : 0;

  // Chi-square test
  const chiSquareResult = calculateChiSquare(a, b, c, d, total);

  // Fisher's exact test. It used to be computed only for n <= 100, which left
  // nothing exact to quote for a large table with one sparse cell (a rare
  // exposure in a big cohort), exactly where chi-square is least reliable.
  // The sum runs over every table with these margins, so it is skipped only
  // for margins in the millions, where it would stall the page.
  const fisherExactPValue =
    hasZeroMarginal || Math.min(totalExposed, totalUnexposed, totalDisease, totalNoDisease) > 1_000_000
      ? null
      : calculateFisherExact(a, b, c, d);

  return {
    table,
    totalExposed,
    totalUnexposed,
    totalDisease,
    totalNoDisease,
    total,
    attackRateExposed,
    attackRateUnexposed,
    attackRateTotal,
    riskRatio,
    riskRatioCI,
    oddsRatio,
    oddsRatioCI,
    riskDifference,
    riskDifferenceCI,
    attributableRiskPercent,
    oddsRatioCorrected: hasZeroCell && !hasZeroMarginal,
    chiSquare: chiSquareResult.chiSquare,
    chiSquarePValue: chiSquareResult.pValue,
    fisherExactPValue,
    minExpectedCount: chiSquareResult.minExpectedCount,
  };
}

// =============================================================================
// CONFIDENCE INTERVAL CALCULATIONS
// Uses log-based methods for ratio measures (RR, OR) and SE for differences
// =============================================================================

function calculateRiskRatioCI(a: number, b: number, c: number, d: number): [number, number] {
  const totalExposed = a + b;
  const totalUnexposed = c + d;

  if (a === 0 || c === 0 || totalExposed === 0 || totalUnexposed === 0) {
    return [0, Infinity];
  }

  const rr = (a / totalExposed) / (c / totalUnexposed);
  const lnRR = Math.log(rr);
  const se = Math.sqrt((b / (a * totalExposed)) + (d / (c * totalUnexposed)));

  const lower = Math.exp(lnRR - 1.96 * se);
  const upper = Math.exp(lnRR + 1.96 * se);

  return [lower, upper];
}

function calculateOddsRatioCI(a: number, b: number, c: number, d: number): [number, number] {
  // Undefined when an entire marginal total is zero
  if (a + b === 0 || c + d === 0 || a + c === 0 || b + d === 0) {
    return [NaN, NaN];
  }

  if (a === 0 || b === 0 || c === 0 || d === 0) {
    // Add 0.5 correction for zero cells
    const aa = a + 0.5;
    const bb = b + 0.5;
    const cc = c + 0.5;
    const dd = d + 0.5;

    const or = (aa * dd) / (bb * cc);
    const lnOR = Math.log(or);
    const se = Math.sqrt(1/aa + 1/bb + 1/cc + 1/dd);

    return [Math.exp(lnOR - 1.96 * se), Math.exp(lnOR + 1.96 * se)];
  }

  const or = (a * d) / (b * c);
  const lnOR = Math.log(or);
  const se = Math.sqrt(1/a + 1/b + 1/c + 1/d);

  return [Math.exp(lnOR - 1.96 * se), Math.exp(lnOR + 1.96 * se)];
}

function calculateRiskDifferenceCI(a: number, b: number, c: number, d: number): [number, number] {
  const n1 = a + b;
  const n2 = c + d;

  if (n1 === 0 || n2 === 0) return [0, 0];

  const p1 = a / n1;
  const p2 = c / n2;
  const rd = p1 - p2;

  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);

  return [rd - 1.96 * se, rd + 1.96 * se];
}

function calculateChiSquare(a: number, b: number, c: number, d: number, n: number): { chiSquare: number; pValue: number; minExpectedCount: number } {
  const totalExposed = a + b;
  const totalUnexposed = c + d;
  const totalDisease = a + c;
  const totalNoDisease = b + d;

  // Undefined when the table is empty or an entire marginal total is zero
  // (expected counts would be 0/NaN); callers must treat NaN as "not computable"
  if (n === 0 || totalExposed === 0 || totalUnexposed === 0 || totalDisease === 0 || totalNoDisease === 0) {
    return { chiSquare: NaN, pValue: NaN, minExpectedCount: NaN };
  }

  // Expected values
  const expA = (totalExposed * totalDisease) / n;
  const expB = (totalExposed * totalNoDisease) / n;
  const expC = (totalUnexposed * totalDisease) / n;
  const expD = (totalUnexposed * totalNoDisease) / n;

  // Chi-square with Yates' correction, clamped at zero so the correction
  // never increases the statistic when |O-E| < 0.5 (R/Epi Info behavior)
  const yatesTerm = (observed: number, expected: number): number => {
    if (expected <= 0) return 0;
    return Math.pow(Math.max(Math.abs(observed - expected) - 0.5, 0), 2) / expected;
  };

  const chiSquare =
    yatesTerm(a, expA) +
    yatesTerm(b, expB) +
    yatesTerm(c, expC) +
    yatesTerm(d, expD);

  // P-value from chi-square distribution with 1 df
  const pValue = 1 - chiSquareCDF(chiSquare, 1);

  return { chiSquare, pValue, minExpectedCount: Math.min(expA, expB, expC, expD) };
}

// =============================================================================
// STATISTICAL DISTRIBUTION FUNCTIONS
// Chi-square CDF via incomplete gamma function (Lanczos approximation)
// =============================================================================

function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0;
  return gammaCDF(x / 2, df / 2);
}

// Incomplete gamma function approximation
function gammaCDF(x: number, a: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    return gammaSeriesLower(x, a);
  }
  return 1 - gammaContinuedFraction(x, a);
}

function gammaSeriesLower(x: number, a: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let sum = 1 / a;
  let term = 1 / a;

  for (let n = 1; n < maxIterations; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < epsilon) break;
  }

  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaContinuedFraction(x: number, a: number): number {
  const maxIterations = 100;
  const epsilon = 1e-10;

  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < maxIterations; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }

  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function logGamma(x: number): number {
  const coefficients = [
    76.18009172947146,
    -86.5053203294168,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let sum = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    sum += coefficients[j] / ++y;
  }

  return -tmp + Math.log(2.506628274631 * sum / x);
}

// =============================================================================
// FISHER'S EXACT TEST
// Exact test for 2×2 tables using hypergeometric distribution
// Two-sided: sums the probability of every table as likely as, or less likely
// than, the one observed. Recommended when any expected cell count is below 5.
// =============================================================================

function calculateFisherExact(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  const rowTotals = [a + b, c + d];
  const colTotals = [a + c, b + d];

  // Calculate probability of observed table
  const pObserved = hypergeometricPMF(a, rowTotals[0], colTotals[0], n);

  // Sum probabilities of tables as extreme or more extreme
  let pValue = 0;
  const minA = Math.max(0, rowTotals[0] - colTotals[1]);
  const maxA = Math.min(rowTotals[0], colTotals[0]);

  for (let i = minA; i <= maxA; i++) {
    const p = hypergeometricPMF(i, rowTotals[0], colTotals[0], n);
    // Relative tolerance, as R's fisher.test uses. The absolute 1e-10 it
    // replaces swept in every table once the observed probability itself fell
    // below 1e-10, flooring the p-value there.
    if (p <= pObserved * (1 + 1e-7)) {
      pValue += p;
    }
  }

  return Math.min(1, pValue);
}

function hypergeometricPMF(k: number, n1: number, K: number, N: number): number {
  return Math.exp(
    logCombination(K, k) +
    logCombination(N - K, n1 - k) -
    logCombination(N, n1)
  );
}

function logCombination(n: number, k: number): number {
  if (k > n || k < 0) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  return logGamma(n + 1);
}

// =============================================================================
// DESCRIPTIVE STATISTICS
// Central tendency, dispersion, and distribution measures for numeric variables
// =============================================================================

export interface DescriptiveStats {
  count: number;
  missing: number;
  mean: number;
  median: number;
  /** The first mode in ascending order; null when no value repeats. */
  mode: number | null;
  /**
   * Every value tied for most frequent, ascending. Empty when no value repeats.
   * `mode` alone named whichever tied value came first in the file, so the
   * same data in a different row order reported a different mode.
   */
  modes: number[];
  /** Sample standard deviation (n - 1). NaN for a single observation. */
  stdDev: number;
  /** Sample variance (n - 1). NaN for a single observation. */
  variance: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  sum: number;
}

export function calculateDescriptiveStats(values: number[]): DescriptiveStats {
  const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  const n = validValues.length;
  const missing = values.length - n;

  if (n === 0) {
    return {
      count: 0,
      missing,
      mean: NaN,
      median: NaN,
      mode: null,
      modes: [],
      stdDev: NaN,
      variance: NaN,
      min: NaN,
      max: NaN,
      range: NaN,
      q1: NaN,
      q3: NaN,
      iqr: NaN,
      sum: 0,
    };
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const sum = validValues.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  // Sample variance and standard deviation (n - 1). One observation has no
  // spread to estimate: reporting 0 says the data do not vary, which is a
  // different claim from not knowing.
  const squaredDiffs = validValues.map(v => Math.pow(v - mean, 2));
  const variance = n > 1 ? squaredDiffs.reduce((acc, v) => acc + v, 0) / (n - 1) : NaN;
  const stdDev = Math.sqrt(variance);

  // Median
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // Quartiles by linear interpolation between order statistics (R type 7,
  // Excel QUARTILE.INC). Other packages use other rules, so small samples can
  // differ slightly from a hand calculation by the (n + 1) method.
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);

  // Mode
  const modes = calculateModes(validValues);
  const mode = modes.length > 0 ? modes[0] : null;

  return {
    count: n,
    missing,
    mean,
    median,
    mode,
    modes,
    stdDev,
    variance,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    q1,
    q3,
    iqr: q3 - q1,
    sum,
  };
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  const index = (p / 100) * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= n) return sorted[n - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function calculateModes(values: number[]): number[] {
  const counts = new Map<number, number>();
  let maxCount = 0;

  for (const v of values) {
    const count = (counts.get(v) || 0) + 1;
    counts.set(v, count);
    if (count > maxCount) maxCount = count;
  }

  // No mode if no value appears more than once
  if (maxCount <= 1) return [];
  return [...counts.entries()]
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

// =============================================================================
// FREQUENCY DISTRIBUTIONS
// Counts and percentages for categorical variables
// =============================================================================

export interface FrequencyItem {
  value: string;
  count: number;
  percent: number;
  cumCount: number;
  cumPercent: number;
}

export function calculateFrequency(values: unknown[]): FrequencyItem[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
    total++;
  }

  const items: FrequencyItem[] = [];
  let cumCount = 0;

  // Sort by count descending
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  for (const [value, count] of sorted) {
    cumCount += count;
    items.push({
      value,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
      cumCount,
      cumPercent: total > 0 ? (cumCount / total) * 100 : 0,
    });
  }

  return items;
}

// =============================================================================
// CHI-SQUARE FOR R×C CONTINGENCY TABLES
// Extended chi-square tests for tables larger than 2×2
// Includes group comparison (R×2) and full cross-tabulation (R×C)
// =============================================================================

/**
 * Chi-square test for R×C contingency tables (Group Comparison)
 * Used when comparing proportions across multiple groups
 */
export interface ChiSquareResult {
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
  /**
   * Smallest expected cell count in the table.
   *
   * Chi-square is an approximation that relies on expected counts being large
   * enough; the usual convention is that every expected count should be at
   * least 5. Below that the p-value does not become NaN or Infinity, it simply
   * becomes wrong while still looking authoritative, so callers have to check
   * this and say so. Both chi-square functions already computed expected
   * counts internally and discarded them, which left no caller able to tell.
   */
  minExpectedCount: number;
  /** How many cells have an expected count below 5. */
  cellsBelowFive: number;
  /**
   * True when Yates' continuity correction was applied, which it is for a
   * 2×2 table only. Callers name the test from this, so the cross-tab and the
   * 2×2 analysis cannot report different p-values for one table unlabelled.
   */
  yatesCorrected: boolean;
}

export interface GroupComparisonRow {
  groupValue: string;
  outcomeYes: number;
  outcomeNo: number;
  total: number;
  proportion: number;
}

export interface GroupComparisonResults {
  rows: GroupComparisonRow[];
  totalOutcomeYes: number;
  totalOutcomeNo: number;
  grandTotal: number;
  chiSquare: ChiSquareResult;
}

/**
 * Calculate chi-square test for an R×2 contingency table
 * (R groups × 2 outcome levels)
 */
export function calculateGroupComparison(
  data: { group: string; hasOutcome: boolean }[]
): GroupComparisonResults {
  // Count by group
  const groupCounts = new Map<string, { yes: number; no: number }>();

  data.forEach(({ group, hasOutcome }) => {
    if (!groupCounts.has(group)) {
      groupCounts.set(group, { yes: 0, no: 0 });
    }
    const counts = groupCounts.get(group)!;
    if (hasOutcome) {
      counts.yes++;
    } else {
      counts.no++;
    }
  });

  // Build rows
  const rows: GroupComparisonRow[] = [];
  let totalYes = 0;
  let totalNo = 0;

  // Sort groups alphabetically for consistent display
  const sortedGroups = Array.from(groupCounts.keys()).sort();

  for (const group of sortedGroups) {
    const counts = groupCounts.get(group)!;
    const total = counts.yes + counts.no;
    rows.push({
      groupValue: group,
      outcomeYes: counts.yes,
      outcomeNo: counts.no,
      total,
      proportion: total > 0 ? counts.yes / total : 0,
    });
    totalYes += counts.yes;
    totalNo += counts.no;
  }

  const grandTotal = totalYes + totalNo;

  // Calculate chi-square for R×2 table
  const chiSquare = calculateChiSquareRC(rows, totalYes, totalNo, grandTotal);

  return {
    rows,
    totalOutcomeYes: totalYes,
    totalOutcomeNo: totalNo,
    grandTotal,
    chiSquare,
  };
}

/**
 * Calculate chi-square statistic for R×2 table
 */
function calculateChiSquareRC(
  rows: GroupComparisonRow[],
  totalYes: number,
  totalNo: number,
  grandTotal: number
): ChiSquareResult {
  if (grandTotal === 0 || rows.length < 2) {
    return { chiSquare: 0, degreesOfFreedom: 0, pValue: 1, minExpectedCount: 0, cellsBelowFive: 0, yatesCorrected: false };
  }

  let chiSquare = 0;
  let minExpectedCount = Infinity;
  let cellsBelowFive = 0;

  for (const row of rows) {
    // Expected values under null hypothesis (no association)
    const expectedYes = (row.total * totalYes) / grandTotal;
    const expectedNo = (row.total * totalNo) / grandTotal;

    for (const expected of [expectedYes, expectedNo]) {
      if (expected < minExpectedCount) minExpectedCount = expected;
      if (expected < 5) cellsBelowFive++;
    }

    // Add to chi-square (skip if expected is 0)
    if (expectedYes > 0) {
      chiSquare += Math.pow(row.outcomeYes - expectedYes, 2) / expectedYes;
    }
    if (expectedNo > 0) {
      chiSquare += Math.pow(row.outcomeNo - expectedNo, 2) / expectedNo;
    }
  }

  // Degrees of freedom for R×2 table: (R-1) × (C-1) = (R-1) × 1 = R-1
  const df = rows.length - 1;

  // Calculate p-value
  const pValue = 1 - chiSquareCDF(chiSquare, df);

  return {
    chiSquare,
    degreesOfFreedom: df,
    pValue,
    minExpectedCount: Number.isFinite(minExpectedCount) ? minExpectedCount : 0,
    cellsBelowFive,
    yatesCorrected: false,
  };
}

/**
 * Cross-tabulation result for R×C table
 */
export interface CrossTabRow {
  rowValue: string;
  counts: Record<string, number>; // column value -> count
  total: number;
}

export interface CrossTabResults {
  rows: CrossTabRow[];
  columnValues: string[];
  columnTotals: Record<string, number>;
  grandTotal: number;
  chiSquare: ChiSquareResult;
}

/**
 * Calculate cross-tabulation for R×C contingency table
 * (R row values × C column values)
 */
export function calculateCrossTabulation(
  data: { rowValue: string; colValue: string }[]
): CrossTabResults {
  // Get unique column values (sorted)
  const columnValuesSet = new Set<string>();
  data.forEach(d => columnValuesSet.add(d.colValue));
  const columnValues = Array.from(columnValuesSet).sort();

  // Count by row and column
  const rowCounts = new Map<string, Record<string, number>>();

  data.forEach(({ rowValue, colValue }) => {
    if (!rowCounts.has(rowValue)) {
      // Initialize with 0 for all columns
      const counts: Record<string, number> = {};
      columnValues.forEach(cv => counts[cv] = 0);
      rowCounts.set(rowValue, counts);
    }
    rowCounts.get(rowValue)![colValue]++;
  });

  // Build rows (sorted by row value)
  const rows: CrossTabRow[] = [];
  const sortedRowValues = Array.from(rowCounts.keys()).sort();

  for (const rowValue of sortedRowValues) {
    const counts = rowCounts.get(rowValue)!;
    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
    rows.push({ rowValue, counts, total });
  }

  // Calculate column totals
  const columnTotals: Record<string, number> = {};
  columnValues.forEach(cv => {
    columnTotals[cv] = rows.reduce((sum, row) => sum + row.counts[cv], 0);
  });

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  // Calculate chi-square for R×C table
  const chiSquare = calculateChiSquareRxC(rows, columnValues, columnTotals, grandTotal);

  return {
    rows,
    columnValues,
    columnTotals,
    grandTotal,
    chiSquare,
  };
}

/**
 * Calculate chi-square statistic for R×C table
 */
function calculateChiSquareRxC(
  rows: CrossTabRow[],
  columnValues: string[],
  columnTotals: Record<string, number>,
  grandTotal: number
): ChiSquareResult {
  if (grandTotal === 0 || rows.length < 2 || columnValues.length < 2) {
    return { chiSquare: 0, degreesOfFreedom: 0, pValue: 1, minExpectedCount: 0, cellsBelowFive: 0, yatesCorrected: false };
  }

  // A 2×2 table gets Yates' continuity correction, as in the 2×2 analysis
  // (and R's chisq.test). Uncorrected here and corrected there, the same table
  // was "significant" in one tab and "not significant" in the other.
  const yatesCorrected = rows.length === 2 && columnValues.length === 2;

  let chiSquare = 0;
  let minExpectedCount = Infinity;
  let cellsBelowFive = 0;

  for (const row of rows) {
    for (const colValue of columnValues) {
      const observed = row.counts[colValue];
      const expected = (row.total * columnTotals[colValue]) / grandTotal;

      if (expected < minExpectedCount) minExpectedCount = expected;
      if (expected < 5) cellsBelowFive++;

      if (expected > 0) {
        const difference = yatesCorrected
          ? Math.max(Math.abs(observed - expected) - 0.5, 0)
          : observed - expected;
        chiSquare += Math.pow(difference, 2) / expected;
      }
    }
  }

  // Degrees of freedom for R×C table: (R-1) × (C-1)
  const df = (rows.length - 1) * (columnValues.length - 1);

  // Calculate p-value
  const pValue = 1 - chiSquareCDF(chiSquare, df);

  return {
    chiSquare,
    degreesOfFreedom: df,
    pValue,
    minExpectedCount: Number.isFinite(minExpectedCount) ? minExpectedCount : 0,
    cellsBelowFive,
    yatesCorrected,
  };
}
