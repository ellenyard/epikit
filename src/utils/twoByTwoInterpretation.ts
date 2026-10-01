/**
 * Which test to quote for a 2×2 table, and the plain-language reading of it.
 *
 * The reading used to be assembled inline from three independent switches: the
 * confidence interval decided "includes 1.0", a chi-square p-value that was
 * never shown decided "significant", and the size of the ratio alone decided
 * "strong". They could and did disagree in one sentence:
 *
 *   "The 95% confidence interval (1.02 - 5.66) does not include 1.0,
 *    indicating this association is not statistically significant."
 *   "...were Undefined times more likely to become ill... The 95% confidence
 *    interval (Undefined) includes 1.0, indicating this association is
 *    statistically significant. This suggests a strong positive association."
 *
 * Here the significance statement comes only from the p-value that is shown,
 * the test is named, an estimate that cannot be calculated is said to be so
 * rather than interpreted, and nothing is called protective or strong.
 */
import type { TwoByTwoResults } from './statistics';
import { formatSigFigs, formatStatPercent } from './localeNumbers';
import { formatPValueText } from './statFormat';

export interface TwoByTwoTest {
  test: 'fisher' | 'yates';
  pValue: number;
  /** True when at least one expected cell count is below 5. */
  smallExpected: boolean;
}

/**
 * The test to report: Fisher's exact when any expected count is below 5,
 * otherwise chi-square with Yates' continuity correction. Null when a whole
 * row or column of the table is empty and nothing can be tested.
 */
export function chooseTwoByTwoTest(r: TwoByTwoResults): TwoByTwoTest | null {
  if (!Number.isFinite(r.chiSquarePValue)) return null;
  const smallExpected = r.minExpectedCount < 5;
  if (smallExpected && r.fisherExactPValue !== null) {
    return { test: 'fisher', pValue: r.fisherExactPValue, smallExpected };
  }
  return { test: 'yates', pValue: r.chiSquarePValue, smallExpected };
}

export function twoByTwoTestName(test: TwoByTwoTest['test']): string {
  return test === 'fisher'
    ? 'Fisher’s exact test (two-sided)'
    : 'Chi-square test with Yates’ correction';
}

export interface InterpretationLabels {
  /** The exposure variable's label, e.g. "Potato Salad". */
  exposure: string;
  /** The value counted as exposed, e.g. "Yes". */
  exposed: string;
  /** The comparison value, e.g. "No". */
  reference: string;
}

const CAVEAT =
  'A statistical association does not by itself show that the exposure caused illness; consider bias, confounding and whether the finding is plausible.';

function interval(ci: [number, number]): string {
  return `${formatSigFigs(ci[0], 3)}–${formatSigFigs(ci[1], 3)}`;
}

/** The test result and what it supports, in the words of the test shown. */
function testSentences(r: TwoByTwoResults, ci: [number, number] | null): string[] {
  const chosen = chooseTwoByTwoTest(r);
  if (!chosen) return [];

  const significant = chosen.pValue < 0.05;
  const sentences = [
    `${twoByTwoTestName(chosen.test)}: ${formatPValueText(chosen.pValue)}${
      chosen.test === 'fisher' ? ' (used because at least one expected cell count is below 5)' : ''
    }.`,
    significant
      ? 'The difference between the groups is statistically significant at the 5% level.'
      : 'The difference between the groups is not statistically significant at the 5% level: it could be due to chance, and with small numbers a real association can be missed.',
  ];

  // The interval and the test are calculated differently, so near 0.05 they
  // can fall on opposite sides. Saying so is better than picking one silently.
  if (ci && Number.isFinite(ci[0]) && Number.isFinite(ci[1])) {
    const excludesOne = ci[0] > 1 || ci[1] < 1;
    if (excludesOne !== significant) {
      sentences.push(
        `The confidence interval ${excludesOne ? 'excludes' : 'includes'} 1.0 while the test gives p ${
          significant ? '<' : '≥'
        } 0.05; the two are calculated differently and can disagree for borderline results, so treat this one as borderline.`
      );
    }
  }
  return sentences;
}

/** Sentences interpreting one cohort (risk ratio) table. */
export function interpretCohort(r: TwoByTwoResults, labels: InterpretationLabels): string[] {
  const { a, b, c, d } = r.table;
  const n1 = r.totalExposed;
  const n0 = r.totalUnexposed;

  if (n1 === 0 || n0 === 0) {
    return [
      `A risk ratio cannot be calculated for ${labels.exposure}: there are no records in the ${
        n1 === 0 ? `exposed group (${labels.exposed})` : `comparison group (${labels.reference})`
      }.`,
    ];
  }

  const rates =
    `Among people exposed to ${labels.exposure} (${labels.exposed}), ${a} of ${n1} became ill ` +
    `(attack rate ${formatStatPercent(r.attackRateExposed * 100, r.total)}%), compared with ${c} of ${n0} ` +
    `(${formatStatPercent(r.attackRateUnexposed * 100, r.total)}%) in the comparison group (${labels.reference}).`;

  if (a === 0 && c === 0) {
    return [rates, 'No one became ill in either group, so the groups cannot be compared.'];
  }
  if (b === 0 && d === 0) {
    return [rates, 'Everyone in both groups became ill, so the groups cannot be compared.'];
  }
  if (c === 0) {
    return [
      rates,
      'Because no one in the comparison group became ill, the risk ratio cannot be calculated (it would mean dividing by zero) and is shown as Undefined.',
      ...testSentences(r, null),
      CAVEAT,
    ];
  }
  if (a === 0) {
    return [
      rates,
      'No one in the exposed group became ill, so the risk ratio is 0 and its confidence interval cannot be calculated.',
      ...testSentences(r, null),
      CAVEAT,
    ];
  }

  const rr = formatSigFigs(r.riskRatio, 3);
  const estimate = Number(rr) === 1
    ? `The risk ratio is ${rr} (95% CI ${interval(r.riskRatioCI)}): the risk of illness was the same in both groups.`
    : `The risk ratio is ${rr} (95% CI ${interval(r.riskRatioCI)}): people in the exposed group were ${rr} times as likely to become ill as people in the comparison group.`;

  return [rates, estimate, ...testSentences(r, r.riskRatioCI), CAVEAT];
}

/** Sentences interpreting one case-control (odds ratio) table. */
export function interpretCaseControl(r: TwoByTwoResults, labels: InterpretationLabels): string[] {
  const { a, b } = r.table;
  const cases = r.totalDisease;
  const controls = r.totalNoDisease;

  if (cases === 0 || controls === 0) {
    return [
      `An odds ratio cannot be calculated for ${labels.exposure}: there are no ${
        cases === 0 ? 'cases' : 'controls'
      } with a recorded exposure.`,
    ];
  }

  const proportions =
    `${a} of ${cases} cases (${formatStatPercent((a / cases) * 100, r.total)}%) and ${b} of ${controls} controls ` +
    `(${formatStatPercent((b / controls) * 100, r.total)}%) were exposed to ${labels.exposure} ` +
    `(${labels.exposed}, compared with ${labels.reference}).`;

  if (r.totalExposed === 0 || r.totalUnexposed === 0) {
    return [
      proportions,
      `An odds ratio cannot be calculated because ${
        r.totalExposed === 0 ? 'no one was exposed' : 'everyone was exposed'
      }.`,
    ];
  }

  const or = formatSigFigs(r.oddsRatio, 3);
  let estimate: string;
  if (r.oddsRatioCorrected) {
    estimate =
      `One cell of the table is zero, so the odds ratio cannot be calculated directly. The value shown, ${or} ` +
      `(95% CI ${interval(r.oddsRatioCI)}), adds 0.5 to every cell (Haldane-Anscombe correction) and should be read as approximate.`;
  } else if (Number(or) === 1) {
    estimate = `The odds ratio is ${or} (95% CI ${interval(r.oddsRatioCI)}): the odds of exposure were the same among cases and controls.`;
  } else {
    estimate = `The odds ratio is ${or} (95% CI ${interval(r.oddsRatioCI)}): the odds of exposure among cases were ${or} times the odds among controls.`;
  }

  return [proportions, estimate, ...testSentences(r, r.oddsRatioCI), CAVEAT];
}
