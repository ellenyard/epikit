/**
 * Which test a 2x2 table is reported with, and what the interpretation says.
 *
 * The interpretation was assembled from three switches that did not consult
 * each other: the confidence interval decided "includes 1.0", a chi-square
 * p-value that was never displayed decided "significant", and the size of the
 * ratio decided "strong". It printed, for real tables:
 *
 *   "The 95% confidence interval (1.02 - 5.66) does not include 1.0,
 *    indicating this association is not statistically significant"
 *   "were Undefined times more likely ... (Undefined) includes 1.0, indicating
 *    this association is statistically significant ... strong positive
 *    association"
 *   "were 0.500 times less likely ... not statistically significant ... This
 *    suggests a protective effect"
 *
 * These checks pin the wording to the numbers: the significance statement
 * follows the p-value that is shown, the test is named, an estimate that
 * cannot be calculated is not interpreted, and nothing is called protective.
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'epikit-2x2text-test-'));
const bundle = async name => {
  const outfile = path.join(tempDir, `${name}.mjs`);
  await build({
    entryPoints: [path.join(root, `src/utils/${name}.ts`)],
    bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
};

/** Two-sided Fisher p in exact integer arithmetic, independent of the module. */
function exactFisher(a, b, c, d) {
  const choose = (n, k) => {
    if (k < 0 || k > n) return 0n;
    let r = 1n;
    for (let i = 1n; i <= BigInt(k); i++) r = (r * (BigInt(n) - BigInt(k) + i)) / i;
    return r;
  };
  const r1 = a + b, c1 = a + c, n = a + b + c + d;
  const lo = Math.max(0, r1 - (b + d)), hi = Math.min(r1, c1);
  let total = 0n;
  const weights = [];
  for (let i = lo; i <= hi; i++) {
    const w = choose(c1, i) * choose(n - c1, r1 - i);
    weights.push([i, w]);
    total += w;
  }
  const observed = weights.find(([i]) => i === a)[1];
  let sum = 0n;
  for (const [, w] of weights) if (w <= observed) sum += w;
  return Number((sum * 10n ** 30n) / total) / 1e30;
}

const labels = { exposure: 'Rice', exposed: 'Yes', reference: 'No' };
const BANNED = [
  /undefined times/i, /times (more|less) likely/i, /protective/i,
  /\bstrong\b/i, /\bmoderate\b/i, /\bweak\b/i, /NaN/, /Infinity/, /a\s+no association/i,
];
const assertClean = (text, what) => {
  for (const pattern of BANNED) {
    assert.ok(!pattern.test(text), `${what}: must not contain ${pattern}: "${text}"`);
  }
  // Never both verdicts in one reading.
  assert.ok(!(/is statistically significant/.test(text) && /is not statistically significant/.test(text)),
    `${what}: says both significant and not significant: "${text}"`);
};

try {
  const { calculateTwoByTwo } = await bundle('statistics');
  const {
    chooseTwoByTwoTest, twoByTwoTestName, interpretCohort, interpretCaseControl,
  } = await bundle('twoByTwoInterpretation');

  const cohort = (a, b, c, d) => interpretCohort(calculateTwoByTwo({ a, b, c, d }), labels).join(' ');
  const caseControl = (a, b, c, d) => interpretCaseControl(calculateTwoByTwo({ a, b, c, d }), labels).join(' ');

  // 1. Which test. Expected counts of 5 or more everywhere: chi-square with
  //    Yates' correction. Any below 5: Fisher's exact.
  {
    // Oswego, smallest expected count 8.12.
    const ample = chooseTwoByTwoTest(calculateTwoByTwo({ a: 43, b: 11, c: 3, d: 18 }));
    assert.equal(ample.test, 'yates');
    assert.equal(ample.smallExpected, false);
    assert.match(twoByTwoTestName(ample.test), /Yates/);

    // 8/2/4/8, smallest expected count 100/22 = 4.55.
    const sparse = chooseTwoByTwoTest(calculateTwoByTwo({ a: 8, b: 2, c: 4, d: 8 }));
    assert.equal(sparse.test, 'fisher');
    assert.equal(sparse.smallExpected, true);
    assert.ok(Math.abs(sparse.pValue - exactFisher(8, 2, 4, 8)) < 1e-9, 'and the p-value is the exact one');
    assert.match(twoByTwoTestName(sparse.test), /Fisher/);
    assert.match(twoByTwoTestName(sparse.test), /two-sided/);

    // Exactly 5 in every cell meets the convention: chi-square.
    assert.equal(chooseTwoByTwoTest(calculateTwoByTwo({ a: 7, b: 3, c: 3, d: 7 })).test, 'yates');

    // A sparse table too large for the old n <= 100 limit still gets Fisher.
    // Row totals 100 and 200, 11 ill of 300: smallest expected 100 * 11 / 300 = 3.67.
    assert.equal(chooseTwoByTwoTest(calculateTwoByTwo({ a: 2, b: 98, c: 9, d: 191 })).test, 'fisher');

    // An empty row or column: nothing to test.
    assert.equal(chooseTwoByTwoTest(calculateTwoByTwo({ a: 5, b: 5, c: 0, d: 0 })), null);
  }

  // 2. An ordinary significant cohort table (Oswego vanilla ice cream).
  //    RR = (43/54)/(3/21) = 5.57.
  {
    const text = cohort(43, 11, 3, 18);
    assertClean(text, 'Oswego');
    assert.match(text, /43 of 54 became ill/);
    assert.match(text, /3 of 21/);
    assert.match(text, /risk ratio is 5\.57/);
    assert.match(text, /5\.57 times as likely/);
    assert.match(text, /Chi-square test with Yates.+correction: p < 0\.001/);
    assert.match(text, /is statistically significant at the 5% level/);
    assert.match(text, /does not by itself show that the exposure caused illness/);
  }

  // 3. The table that produced "does not include 1.0 ... not statistically
  //    significant". 8/2/4/8: RR 2.40, CI 1.02-5.66, sparse, so Fisher is
  //    shown; exact p = 0.043, and the statement follows that p-value.
  {
    const p = exactFisher(8, 2, 4, 8);
    assert.ok(p < 0.05 && p > 0.04, `reference Fisher p should be about 0.043, got ${p}`);
    const text = cohort(8, 2, 4, 8);
    assertClean(text, '8/2/4/8');
    assert.match(text, /Fisher.s exact test \(two-sided\): p = 0\.043/);
    assert.match(text, /expected cell count is below 5/);
    assert.match(text, /is statistically significant at the 5% level/);
    assert.doesNotMatch(text, /borderline/, 'interval and test agree here, so no borderline note');
  }

  // 4. Interval and test on opposite sides of 0.05: said plainly, with one
  //    verdict (the test's) and a note, never a contradiction. The table is
  //    found from first principles here, with the interval computed by the
  //    Katz formula directly, rather than taken from the module under test.
  {
    const lnCI = (a, b, c, d) => {
      const rr = (a / (a + b)) / (c / (c + d));
      const se = Math.sqrt(b / (a * (a + b)) + d / (c * (c + d)));
      return [Math.exp(Math.log(rr) - 1.96 * se), Math.exp(Math.log(rr) + 1.96 * se)];
    };
    let found = null;
    for (let a = 12; a <= 30 && !found; a++) {
      for (let c = 5; c < a && !found; c++) {
        const [lo] = lnCI(a, 40 - a, c, 40 - c);
        const r = calculateTwoByTwo({ a, b: 40 - a, c, d: 40 - c });
        if (lo > 1 && r.minExpectedCount >= 5 && r.chiSquarePValue >= 0.05) found = [a, 40 - a, c, 40 - c];
      }
    }
    assert.ok(found, 'a table with CI above 1 but Yates p >= 0.05 exists among 40-vs-40 tables');
    const text = cohort(...found);
    assertClean(text, `borderline ${found}`);
    assert.match(text, /is not statistically significant at the 5% level/);
    assert.match(text, /confidence interval excludes 1\.0 while the test gives p ≥ 0\.05/);
    assert.match(text, /borderline/);
  }

  // 5. Nobody in the comparison group ill: the classic point-source table.
  //    The risk ratio is undefined and must be called that, not interpreted.
  {
    const text = cohort(25, 5, 0, 12);
    assertClean(text, 'c = 0');
    assert.match(text, /25 of 30 became ill/);
    assert.match(text, /0 of 12/);
    assert.match(text, /risk ratio cannot be calculated/);
    assert.doesNotMatch(text, /times as likely/);
    assert.doesNotMatch(text, /includes 1\.0|excludes 1\.0/, 'no statement about an interval that does not exist');
    assert.match(text, /is statistically significant at the 5% level/, 'the test still applies to the difference');
  }

  // 6. Nobody in the exposed group ill.
  {
    const text = cohort(0, 10, 8, 12);
    assertClean(text, 'a = 0');
    assert.match(text, /risk ratio is 0 and its confidence interval cannot be calculated/);
    assert.doesNotMatch(text, /times as likely/);
  }

  // 7. Lower risk in the exposed, not significant: 3/20 vs 6/20, RR 0.50.
  //    No "less likely" arithmetic and no claim of protection.
  {
    const text = cohort(3, 17, 6, 14);
    assertClean(text, 'RR 0.5');
    assert.match(text, /0\.500 times as likely/);
    assert.match(text, /is not statistically significant/);
  }

  // 8. Identical attack rates.
  {
    const text = cohort(5, 5, 5, 5);
    assertClean(text, 'RR 1');
    assert.match(text, /risk of illness was the same in both groups/);
    assert.doesNotMatch(text, /times as likely/);
  }

  // 9. Tables with nothing to compare say so and stop.
  {
    for (const [what, table, phrase] of [
      ['no comparison group', [5, 5, 0, 0], /no records in the comparison group/],
      ['no exposed group', [0, 0, 5, 5], /no records in the exposed group/],
      ['nobody ill', [0, 10, 0, 10], /No one became ill in either group/],
      ['everybody ill', [10, 0, 10, 0], /Everyone in both groups became ill/],
    ]) {
      const text = cohort(...table);
      assertClean(text, what);
      assert.match(text, phrase, what);
      assert.doesNotMatch(text, /statistically significant/, `${what}: no verdict without a test`);
    }
  }

  // 10. Case-control. 36/12/8/40 is the bundled outbreak's potato salad:
  //     OR = 36*40 / (12*8) = 15.0.
  {
    const text = caseControl(36, 12, 8, 40);
    assertClean(text, 'potato salad OR');
    assert.match(text, /36 of 44 cases/);
    assert.match(text, /12 of 52 controls/);
    assert.match(text, /odds ratio is 15\.0/);
    assert.match(text, /15\.0 times the odds among controls/);
    assert.match(text, /is statistically significant at the 5% level/);
  }

  // 11. A zero cell: the corrected odds ratio is labelled as corrected and
  //     approximate, not presented as "cases had 78.8 times the odds".
  //     (12.5 * 20.5) / (0.5 * 6.5) = 78.85.
  {
    const text = caseControl(12, 0, 6, 20);
    assertClean(text, 'zero cell OR');
    assert.match(text, /cannot be calculated directly/);
    assert.match(text, /78\.8/);
    assert.match(text, /adds 0\.5 to every cell/);
    assert.match(text, /approximate/);
    assert.doesNotMatch(text, /78\.8 times the odds/);
  }

  // 12. Case-control with no controls, or nobody exposed.
  {
    assert.match(caseControl(5, 0, 5, 0), /no controls/);
    assert.match(caseControl(0, 0, 5, 5), /no one was exposed/);
    assertClean(caseControl(5, 0, 5, 0), 'no controls');
    assertClean(caseControl(0, 0, 5, 5), 'nobody exposed');
  }

  // 13. Sweep: every small table reads cleanly, and whenever a verdict is
  //     given it matches the p-value of the test that is named.
  {
    let checked = 0;
    for (let a = 0; a <= 12; a += 2) for (let b = 0; b <= 12; b += 3) {
      for (let c = 0; c <= 12; c += 2) for (let d = 0; d <= 12; d += 3) {
        const r = calculateTwoByTwo({ a, b, c, d });
        const chosen = chooseTwoByTwoTest(r);
        for (const [design, text] of [['cohort', cohort(a, b, c, d)], ['case-control', caseControl(a, b, c, d)]]) {
          const what = `${design} ${a}/${b}/${c}/${d}`;
          assertClean(text, what);
          const saysSignificant = /is statistically significant at the 5% level/.test(text);
          const saysNot = /is not statistically significant at the 5% level/.test(text);
          if (saysSignificant || saysNot) {
            assert.ok(chosen, `${what}: a verdict needs a test`);
            assert.equal(saysSignificant, chosen.pValue < 0.05, `${what}: verdict must follow the shown p-value`);
            assert.ok(text.includes(twoByTwoTestName(chosen.test)), `${what}: the test must be named`);
          }
          checked++;
        }
      }
    }
    assert.ok(checked > 1000);
  }

  console.log('2x2 interpretation regression: all checks passed');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
