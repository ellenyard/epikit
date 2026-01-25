// Statistical calculations for epidemiological analysis

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

  // Statistical tests
  chiSquare: number;
  chiSquarePValue: number;
  fisherExactPValue: number | null;
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
  const riskRatio = attackRateUnexposed > 0 ? attackRateExposed / attackRateUnexposed : Infinity;
  const riskRatioCI = calculateRiskRatioCI(a, b, c, d);

  // Odds Ratio
  const oddsRatio = (b * c) > 0 ? (a * d) / (b * c) : Infinity;
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

  // Fisher's exact test (only for small samples)
  const fisherExactPValue = total <= 100 ? calculateFisherExact(a, b, c, d) : null;

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
    chiSquare: chiSquareResult.chiSquare,
    chiSquarePValue: chiSquareResult.pValue,
    fisherExactPValue,
  };
}

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

function calculateChiSquare(a: number, b: number, c: number, d: number, n: number): { chiSquare: number; pValue: number } {
  const totalExposed = a + b;
  const totalUnexposed = c + d;
  const totalDisease = a + c;
  const totalNoDisease = b + d;

  // Expected values
  const expA = (totalExposed * totalDisease) / n;
  const expB = (totalExposed * totalNoDisease) / n;
  const expC = (totalUnexposed * totalDisease) / n;
  const expD = (totalUnexposed * totalNoDisease) / n;

  // Chi-square with Yates' correction
  const chiSquare =
    Math.pow(Math.abs(a - expA) - 0.5, 2) / expA +
    Math.pow(Math.abs(b - expB) - 0.5, 2) / expB +
    Math.pow(Math.abs(c - expC) - 0.5, 2) / expC +
    Math.pow(Math.abs(d - expD) - 0.5, 2) / expD;

  // P-value from chi-square distribution with 1 df
  const pValue = 1 - chiSquareCDF(chiSquare, 1);

  return { chiSquare, pValue };
}

// Chi-square CDF approximation
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
    -86.50532032941677,
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

  return -tmp + Math.log(2.5066282746310005 * sum / x);
}

// Fisher's exact test (two-tailed)
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
    if (p <= pObserved + 1e-10) {
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

// Descriptive statistics
export interface DescriptiveStats {
  count: number;
  missing: number;
  mean: number;
  median: number;
  mode: number | null;
  stdDev: number;
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

  // Variance and standard deviation
  const squaredDiffs = validValues.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);

  // Median
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // Quartiles
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);

  // Mode
  const mode = calculateMode(validValues);

  return {
    count: n,
    missing,
    mean,
    median,
    mode,
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

function calculateMode(values: number[]): number | null {
  const counts = new Map<number, number>();
  let maxCount = 0;
  let mode: number | null = null;

  for (const v of values) {
    const count = (counts.get(v) || 0) + 1;
    counts.set(v, count);
    if (count > maxCount) {
      maxCount = count;
      mode = v;
    }
  }

  // Return null if no value appears more than once
  return maxCount > 1 ? mode : null;
}

// Frequency distribution
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

/**
 * Chi-square test for R×C contingency tables (Group Comparison)
 * Used when comparing proportions across multiple groups
 */
export interface ChiSquareResult {
  chiSquare: number;
  degreesOfFreedom: number;
  pValue: number;
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
    return { chiSquare: 0, degreesOfFreedom: 0, pValue: 1 };
  }

  let chiSquare = 0;

  for (const row of rows) {
    // Expected values under null hypothesis (no association)
    const expectedYes = (row.total * totalYes) / grandTotal;
    const expectedNo = (row.total * totalNo) / grandTotal;

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

  return { chiSquare, degreesOfFreedom: df, pValue };
}
