/**
 * Validation of the epidemiological statistics against independently known
 * answers.
 *
 * These assertions are deliberately NOT "whatever the code currently returns".
 * Every expected value here comes from a published worked example, a textbook
 * critical value, or arithmetic done by hand from the standard formula. The
 * point is to find out whether the numbers are right, not to freeze in place
 * whatever they happen to be.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-stats-test-'));
const bundled = path.join(tempDir, 'statistics.mjs');

const close = (actual, expected, tol, what) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: expected ${expected} (+/- ${tol}), got ${actual}`
  );

/**
 * erfc via Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7), implemented here so
 * the chi-square p-values are checked against something independent of the
 * module under test. For 1 degree of freedom the upper tail is exactly
 * erfc(sqrt(x/2)), which gives an analytic reference.
 */
function erfc(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 1 - sign * y;
}
const chiSquareUpperTailDf1 = (x) => erfc(Math.sqrt(x / 2));

try {
  await build({
    entryPoints: [path.join(root, 'src/utils/statistics.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundled,
    logLevel: 'silent',
  });

  const {
    calculateTwoByTwo,
    calculateDescriptiveStats,
    calculateFrequency,
    calculateGroupComparison,
    calculateCrossTabulation,
  } = await import(pathToFileURL(bundled).href);

  // ---------------------------------------------------------------------------
  // 1. CDC Oswego church-supper outbreak, vanilla ice cream.
  //    The canonical FETP worked example (CDC, Principles of Epidemiology in
  //    Public Health Practice; EIS case study). Ate: 43 ill / 11 well.
  //    Did not eat: 3 ill / 18 well.
  // ---------------------------------------------------------------------------
  {
    const r = calculateTwoByTwo({ a: 43, b: 11, c: 3, d: 18 });

    close(r.attackRateExposed, 43 / 54, 1e-12, 'Oswego attack rate, exposed');
    close(r.attackRateUnexposed, 3 / 21, 1e-12, 'Oswego attack rate, unexposed');
    close(r.attackRateTotal, 46 / 75, 1e-12, 'Oswego overall attack rate');

    // RR = (43/54) / (3/21) = 5.5741
    close(r.riskRatio, 5.574074074, 1e-6, 'Oswego risk ratio');
    // OR = (43*18) / (11*3) = 774/33 = 23.4545
    close(r.oddsRatio, 23.454545455, 1e-6, 'Oswego odds ratio');
    close(r.riskDifference, 43 / 54 - 3 / 21, 1e-12, 'Oswego risk difference');
    // AR% = (ARe - ARu) / ARe * 100
    close(r.attributableRiskPercent, 82.0598, 0.01, 'Oswego attributable risk percent');

    // Yates-corrected chi-square, worked by hand:
    // expected 33.12 / 20.88 / 12.88 / 8.12, |O-E| = 9.88 throughout,
    // so each term is (9.88-0.5)^2 / E = 87.9844 / E.
    close(r.chiSquare, 24.536950, 1e-4, 'Oswego Yates chi-square');

    // A strongly significant table: the interval must sit well above 1.
    assert.ok(r.riskRatioCI[0] > 1, 'Oswego RR lower bound should exceed 1');
    // Katz SE(ln RR) = sqrt(b/(a*n1) + d/(c*n0)), z = 1.96.
    {
      const se = Math.sqrt(11 / (43 * 54) + 18 / (3 * 21));
      close(r.riskRatioCI[0], Math.exp(Math.log(5.574074074) - 1.96 * se), 1e-6,
        'Oswego RR CI lower (Katz SE, z = 1.96)');
      close(r.riskRatioCI[1], Math.exp(Math.log(5.574074074) + 1.96 * se), 1e-6,
        'Oswego RR CI upper (Katz SE, z = 1.96)');
    }
    assert.ok(
      r.riskRatioCI[0] < r.riskRatio && r.riskRatio < r.riskRatioCI[1],
      'Oswego RR must lie inside its own interval'
    );
    assert.ok(
      r.oddsRatioCI[0] < r.oddsRatio && r.oddsRatio < r.oddsRatioCI[1],
      'Oswego OR must lie inside its own interval'
    );
  }

  // ---------------------------------------------------------------------------
  // 2. A table worked entirely by hand, to pin the formulas down exactly.
  //    a=20 b=30 c=10 d=40. Expected counts 15/35/15/35, |O-E| = 5 throughout,
  //    so each Yates term is (5-0.5)^2 / E = 20.25 / E, giving
  //    20.25/15 + 20.25/35 + 20.25/15 + 20.25/35 = 3.857142857.
  // ---------------------------------------------------------------------------
  {
    const r = calculateTwoByTwo({ a: 20, b: 30, c: 10, d: 40 });
    close(r.riskRatio, 2, 1e-12, 'hand-worked risk ratio');
    close(r.oddsRatio, 800 / 300, 1e-12, 'hand-worked odds ratio');
    close(r.riskDifference, 0.2, 1e-12, 'hand-worked risk difference');
    close(r.chiSquare, 3.857142857, 1e-8, 'hand-worked Yates chi-square');

    // Woolf SE = sqrt(1/20 + 1/30 + 1/10 + 1/40) = sqrt(0.2083333)
    const se = Math.sqrt(1 / 20 + 1 / 30 + 1 / 10 + 1 / 40);
    close(r.oddsRatioCI[0], Math.exp(Math.log(800 / 300) - 1.96 * se), 1e-8, 'Woolf OR CI lower');
    close(r.oddsRatioCI[1], Math.exp(Math.log(800 / 300) + 1.96 * se), 1e-8, 'Woolf OR CI upper');
  }

  // ---------------------------------------------------------------------------
  // 3. Chi-square p-values against the analytic 1-df upper tail, and against
  //    published critical values.
  // ---------------------------------------------------------------------------
  {
    for (const t of [
      { a: 20, b: 30, c: 10, d: 40 },
      { a: 43, b: 11, c: 3, d: 18 },
      { a: 12, b: 8, c: 9, d: 11 },
      { a: 5, b: 15, c: 14, d: 6 },
    ]) {
      const r = calculateTwoByTwo(t);
      const reference = chiSquareUpperTailDf1(r.chiSquare);
      close(r.chiSquarePValue, reference, 2e-4,
        `p-value for chi-square ${r.chiSquare.toFixed(4)}`);
    }

    // Published 1-df critical values: chi-square 3.841459 is the 0.05 point,
    // so a statistic just above it must give p just below 0.05.
    const r = calculateTwoByTwo({ a: 20, b: 30, c: 10, d: 40 });
    assert.ok(r.chiSquare > 3.841459, 'test table should exceed the 0.05 critical value');
    assert.ok(r.chiSquarePValue < 0.05, 'and therefore report p < 0.05');
    assert.ok(r.chiSquarePValue > 0.025, 'but not below the 0.025 critical value (5.024)');
  }

  // ---------------------------------------------------------------------------
  // 4. Fisher's exact test: Fisher's own tea-tasting table.
  //    Two-tailed p = 34/70 = 0.485714...
  // ---------------------------------------------------------------------------
  {
    const r = calculateTwoByTwo({ a: 3, b: 1, c: 1, d: 3 });
    close(r.fisherExactPValue, 34 / 70, 1e-9, "Fisher's tea-tasting two-tailed p");
  }

  // ---------------------------------------------------------------------------
  // 5. Zero cells: Haldane-Anscombe 0.5 correction on the odds ratio, and the
  //    point estimate consistent with its interval.
  // ---------------------------------------------------------------------------
  {
    const r = calculateTwoByTwo({ a: 0, b: 10, c: 5, d: 5 });
    close(r.oddsRatio, (0.5 * 5.5) / (10.5 * 5.5), 1e-12, 'Haldane-corrected odds ratio');
    assert.ok(
      r.oddsRatioCI[0] < r.oddsRatio && r.oddsRatio < r.oddsRatioCI[1],
      'corrected OR must lie inside its corrected interval'
    );
    close(r.riskRatio, 0, 1e-12, 'risk ratio is 0 when no exposed case occurred');

    // Pin the corrected interval numerically, not just structurally. Asserting
    // only that the estimate lies inside its interval cannot detect a wrong
    // z multiplier, which mutation testing confirmed.
    {
      const aa = 0.5, bb = 10.5, cc = 5.5, dd = 5.5;
      const or = (aa * dd) / (bb * cc);
      const se = Math.sqrt(1 / aa + 1 / bb + 1 / cc + 1 / dd);
      close(r.oddsRatioCI[0], Math.exp(Math.log(or) - 1.96 * se), 1e-9,
        'Haldane-corrected OR CI lower (Woolf SE, z = 1.96)');
      close(r.oddsRatioCI[1], Math.exp(Math.log(or) + 1.96 * se), 1e-9,
        'Haldane-corrected OR CI upper (Woolf SE, z = 1.96)');
    }

    // An entire empty margin is genuinely undefined, not zero.
    const undef = calculateTwoByTwo({ a: 0, b: 0, c: 5, d: 5 });
    assert.equal(undef.oddsRatio, Infinity, 'empty margin gives an undefined odds ratio');
    assert.ok(Number.isNaN(undef.chiSquare), 'empty margin gives an undefined chi-square');
  }

  // ---------------------------------------------------------------------------
  // 6. Descriptive statistics on a set with known answers.
  //    [2,4,4,4,5,5,7,9]: mean 5, sample variance 32/7, median 4.5,
  //    quartiles by the R type-7 rule are 4 and 5.5.
  // ---------------------------------------------------------------------------
  {
    const s = calculateDescriptiveStats([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.equal(s.count, 8);
    close(s.mean, 5, 1e-12, 'mean');
    close(s.median, 4.5, 1e-12, 'median');
    close(s.variance, 32 / 7, 1e-12, 'sample variance (n-1)');
    close(s.stdDev, Math.sqrt(32 / 7), 1e-12, 'sample standard deviation');
    close(s.q1, 4, 1e-12, 'first quartile');
    close(s.q3, 5.5, 1e-12, 'third quartile');
    close(s.iqr, 1.5, 1e-12, 'interquartile range');
    assert.equal(s.min, 2);
    assert.equal(s.max, 9);
    assert.equal(s.range, 7);
    assert.equal(s.sum, 40);
    assert.equal(Number(s.mode), 4, 'mode');

    // Missing values are excluded from n, not treated as zero.
    const withGaps = calculateDescriptiveStats([2, NaN, 4, NaN, 6]);
    assert.equal(withGaps.count, 3, 'count excludes missing');
    assert.equal(withGaps.missing, 2, 'missing are reported');
    close(withGaps.mean, 4, 1e-12, 'mean ignores missing rather than counting them as 0');
  }

  // ---------------------------------------------------------------------------
  // 7. Frequencies: percents on the non-missing denominator, cumulative to 100.
  // ---------------------------------------------------------------------------
  {
    const f = calculateFrequency(['a', 'b', 'a', 'c', 'a', 'b']);
    const by = Object.fromEntries(f.map(i => [i.value, i]));
    assert.equal(by.a.count, 3);
    assert.equal(by.b.count, 2);
    assert.equal(by.c.count, 1);
    close(by.a.percent, 50, 1e-9, 'percent for the modal value');
    close(f.reduce((s, i) => s + i.percent, 0), 100, 1e-9, 'percents sum to 100');
    close(f[f.length - 1].cumPercent, 100, 1e-9, 'cumulative percent ends at 100');
    assert.equal(f[f.length - 1].cumCount, 6, 'cumulative count ends at n');
  }

  // ---------------------------------------------------------------------------
  // 8. R x C chi-square: degrees of freedom, and independence giving ~0.
  // ---------------------------------------------------------------------------
  {
    // Perfectly independent 2x2 worth of data: chi-square should be ~0 and p ~1.
    const independent = [];
    for (let i = 0; i < 100; i++) {
      independent.push({ group: i % 2 ? 'A' : 'B', hasOutcome: i % 4 < 2 });
    }
    const g = calculateGroupComparison(independent);
    close(g.chiSquare.chiSquare, 0, 1e-9, 'independent groups give chi-square 0');
    close(g.chiSquare.pValue, 1, 1e-9, 'and p = 1');
    assert.equal(g.grandTotal, 100, 'every record is counted');

    // 3 rows x 2 columns has (3-1)(2-1) = 2 degrees of freedom.
    const threeGroups = [];
    for (let i = 0; i < 90; i++) {
      threeGroups.push({ group: ['A', 'B', 'C'][i % 3], hasOutcome: i % 2 === 0 });
    }
    const g3 = calculateGroupComparison(threeGroups);
    assert.equal(g3.chiSquare.degreesOfFreedom, 2,
      '3 groups x 2 outcomes has 2 degrees of freedom');

    // A perfectly associated 3x3 table: every row value implies its column
    // value. For a k x k table at perfect association chi-square is n(k-1),
    // here 90 * 2 = 180, with (3-1)(3-1) = 4 degrees of freedom.
    const cross = [];
    for (let i = 0; i < 90; i++) {
      cross.push({ rowValue: ['x', 'y', 'z'][i % 3], colValue: ['p', 'q', 'r'][i % 3] });
    }
    const ct = calculateCrossTabulation(cross);
    assert.equal(ct.chiSquare.degreesOfFreedom, 4, '3x3 table has 4 degrees of freedom');
    close(ct.chiSquare.chiSquare, 180, 1e-9, 'perfect 3x3 association gives n(k-1) = 180');
    assert.equal(ct.grandTotal, 90, 'every record is counted');
  }

  // ---------------------------------------------------------------------------
  // 9. Expected cell counts, which decide whether the p-value means anything.
  //
  //    Both chi-square functions computed expected counts and discarded them,
  //    so no caller could tell a sound table from a sparse one. A sparse table
  //    does not produce NaN: it produces a confident, wrong p-value, which is
  //    the failure mode that gets quoted in a report.
  // ---------------------------------------------------------------------------
  {
    // The 3x3 table above is balanced: every row and column total is 30 of 90,
    // so every expected count is 30 * 30 / 90 = 10.
    const balanced = [];
    for (let i = 0; i < 90; i++) {
      balanced.push({ rowValue: ['x', 'y', 'z'][i % 3], colValue: ['p', 'q', 'r'][i % 3] });
    }
    const okTable = calculateCrossTabulation(balanced);
    close(okTable.chiSquare.minExpectedCount, 10, 1e-9, 'balanced 3x3 expects 10 per cell');
    assert.equal(okTable.chiSquare.cellsBelowFive, 0, 'a balanced table has no sparse cells');

    // A deliberately sparse 2x2. Row totals 2 and 10, column totals 2 and 10,
    // n = 12, so the expected counts are 0.333, 1.667, 1.667 and 8.333.
    const sparse = [
      { rowValue: 'a', colValue: 'p' },
      { rowValue: 'a', colValue: 'q' },
      { rowValue: 'b', colValue: 'p' },
      ...Array.from({ length: 9 }, () => ({ rowValue: 'b', colValue: 'q' })),
    ];
    const sparseTable = calculateCrossTabulation(sparse);
    assert.equal(sparseTable.grandTotal, 12);
    close(sparseTable.chiSquare.minExpectedCount, 2 * 2 / 12, 1e-9,
      'the smallest expected count must be reported, not the smallest observed');
    assert.equal(sparseTable.chiSquare.cellsBelowFive, 3,
      'three of the four expected counts are below 5');
    // The p-value is still produced. That is the point: nothing here signals a
    // problem on its own, which is why the count has to be surfaced.
    assert.ok(Number.isFinite(sparseTable.chiSquare.pValue),
      'a sparse table still yields a finite p-value, hence the warning');

    // The boundary: an expected count of exactly 5 satisfies the convention and
    // must not be counted as sparse. Row and column totals of 10 with n = 20
    // give exactly 5 in every cell.
    const boundary = [];
    for (let i = 0; i < 20; i++) {
      boundary.push({ rowValue: i % 2 ? 'a' : 'b', colValue: i % 4 < 2 ? 'p' : 'q' });
    }
    const boundaryTable = calculateCrossTabulation(boundary);
    close(boundaryTable.chiSquare.minExpectedCount, 5, 1e-9, 'every expected count is exactly 5');
    assert.equal(boundaryTable.chiSquare.cellsBelowFive, 0,
      'an expected count of exactly 5 meets the convention and is not sparse');

    // A table that cannot be tested reports zero degrees of freedom and still
    // carries the fields, since the interface gates its warning on df.
    const oneColumn = [
      { rowValue: 'a', colValue: 'p' },
      { rowValue: 'b', colValue: 'p' },
    ];
    const degenerate = calculateCrossTabulation(oneColumn);
    assert.equal(degenerate.chiSquare.degreesOfFreedom, 0, 'one column cannot be tested');
    assert.equal(typeof degenerate.chiSquare.minExpectedCount, 'number',
      'the field must exist even when the test is not computable');
    assert.equal(typeof degenerate.chiSquare.cellsBelowFive, 'number');

    // The R x 2 path reports the same way. Group A has 2 records, B has 10,
    // with 10 outcomes overall: expected 1.667, 0.333, 8.333, 1.667.
    const sparseGroups = [
      { group: 'A', hasOutcome: true },
      { group: 'A', hasOutcome: false },
      ...Array.from({ length: 9 }, () => ({ group: 'B', hasOutcome: true })),
      { group: 'B', hasOutcome: false },
    ];
    const gSparse = calculateGroupComparison(sparseGroups);
    assert.equal(gSparse.grandTotal, 12);
    close(gSparse.chiSquare.minExpectedCount, 2 * 2 / 12, 1e-9,
      'the group comparison must report its smallest expected count too');
    assert.equal(gSparse.chiSquare.cellsBelowFive, 3,
      'three expected counts below 5 in the R x 2 table');

    // The same boundary in the R x 2 path, which is a separate function and was
    // initially left untested: two groups of 10 with 10 outcomes overall gives
    // an expected count of exactly 5 in all four cells.
    const gBoundary = [];
    for (let i = 0; i < 20; i++) {
      gBoundary.push({ group: i % 2 ? 'A' : 'B', hasOutcome: i % 4 < 2 });
    }
    const gb = calculateGroupComparison(gBoundary);
    close(gb.chiSquare.minExpectedCount, 5, 1e-9, 'R x 2 expected counts are exactly 5');
    assert.equal(gb.chiSquare.cellsBelowFive, 0,
      'exactly 5 is not below 5 in the R x 2 path either');

    // And a well-powered group comparison is not flagged.
    const ample = [];
    for (let i = 0; i < 200; i++) {
      ample.push({ group: i % 2 ? 'A' : 'B', hasOutcome: i % 3 === 0 });
    }
    const gAmple = calculateGroupComparison(ample);
    assert.equal(gAmple.chiSquare.cellsBelowFive, 0, 'an ample table is not flagged');
    assert.ok(gAmple.chiSquare.minExpectedCount >= 5);
  }

  console.log('statistics regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
