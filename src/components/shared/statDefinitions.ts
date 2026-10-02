/**
 * Pre-defined statistical definitions for common measures.
 * These can be imported and used throughout the app.
 */
export const statDefinitions = {
  mean: {
    term: 'Mean',
    definition: 'The arithmetic average of all values. Add up all values and divide by the count. Sensitive to extreme values (outliers).',
  },
  median: {
    term: 'Median',
    definition: 'The middle value when the data are sorted. Half the values are above and half below. More robust to outliers than the mean.',
  },
  mode: {
    term: 'Mode',
    definition: 'The most frequently occurring value in the dataset. A dataset can have no mode, one mode, or multiple modes; when several values tie, all of them are listed.',
  },
  stdDev: {
    term: 'Standard Deviation',
    definition: 'Roughly the typical distance of values from the mean; a larger standard deviation indicates more spread. This is the sample standard deviation (n − 1 in the denominator), so it is not shown for a single value.',
  },
  variance: {
    term: 'Variance',
    definition: 'The square of the standard deviation (sample variance, n − 1 in the denominator). Measures how spread out values are from the mean.',
  },
  range: {
    term: 'Range',
    definition: 'The difference between the maximum and minimum values. Simple measure of spread but sensitive to outliers.',
  },
  iqr: {
    term: 'Interquartile Range (IQR)',
    definition: 'The range of the middle 50% of values (Q3 - Q1). More robust to outliers than the full range. Uses the quartiles as calculated here (linear interpolation).',
  },
  min: {
    term: 'Minimum',
    definition: 'The smallest value in the dataset.',
  },
  max: {
    term: 'Maximum',
    definition: 'The largest value in the dataset.',
  },
  q1: {
    term: 'First Quartile (Q1)',
    definition: 'The 25th percentile. 25% of values fall below Q1. Also called the lower quartile. Calculated by linear interpolation between ordered values (as in R and Excel QUARTILE.INC); other software, and the (n + 1) hand method, can differ slightly in small samples.',
  },
  q3: {
    term: 'Third Quartile (Q3)',
    definition: 'The 75th percentile. 75% of values fall below Q3. Also called the upper quartile. Calculated by linear interpolation between ordered values (as in R and Excel QUARTILE.INC); other software, and the (n + 1) hand method, can differ slightly in small samples.',
  },
  riskRatio: {
    term: 'Risk Ratio (Relative Risk)',
    definition: 'The attack rate (risk) in the exposed group divided by the attack rate in the comparison group. RR = 1 means the same risk in both; RR > 1 means higher risk in the exposed; RR < 1 means lower risk in the exposed.',
  },
  oddsRatio: {
    term: 'Odds Ratio',
    definition: 'The odds of exposure among cases divided by the odds of exposure among controls. OR = 1 means no association; OR > 1 means exposure was more common among cases; OR < 1 means it was less common among cases.',
  },
  attackRate: {
    term: 'Attack Rate',
    definition: 'The proportion of people who became ill among those at risk. Often expressed as a percentage. In outbreak settings, used synonymously with "risk."',
  },
  confidenceInterval: {
    term: '95% Confidence Interval',
    definition: 'A range of values compatible with the data for the true population value. For a ratio, an interval that excludes 1.0 corresponds to statistical significance at about the 5% level; for borderline results it can disagree slightly with the test p-value, which is calculated differently.',
  },
  pValue: {
    term: 'P-value',
    definition: 'The probability of seeing a difference at least this large if there were truly no association. In the 2×2 analysis it comes from the chi-square test with Yates’ correction, or from Fisher’s exact test when an expected cell count is below 5. p < 0.05 is conventionally called statistically significant.',
  },
  chiSquare: {
    term: 'Chi-Square Test',
    definition: 'Tests whether there is a statistically significant association between two categorical variables. Used with Yates’ continuity correction for 2×2 tables. Unreliable when any expected cell count is below 5.',
  },
  fisherExact: {
    term: "Fisher's Exact Test",
    definition: 'An exact test for 2×2 tables (two-sided), preferred when numbers are small: the usual rule is any expected cell count below 5.',
  },
};
