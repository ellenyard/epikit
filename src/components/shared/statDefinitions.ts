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
    definition: 'The middle value when data is sorted. Half the values are above and half below. More robust to outliers than the mean.',
  },
  mode: {
    term: 'Mode',
    definition: 'The most frequently occurring value in the dataset. A dataset can have no mode, one mode, or multiple modes.',
  },
  stdDev: {
    term: 'Standard Deviation',
    definition: 'Measures the average distance of values from the mean. A larger standard deviation indicates more spread in the data.',
  },
  variance: {
    term: 'Variance',
    definition: 'The square of the standard deviation. Measures how spread out values are from the mean.',
  },
  range: {
    term: 'Range',
    definition: 'The difference between the maximum and minimum values. Simple measure of spread but sensitive to outliers.',
  },
  iqr: {
    term: 'Interquartile Range (IQR)',
    definition: 'The range of the middle 50% of values (Q3 - Q1). More robust to outliers than the full range.',
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
    definition: 'The 25th percentile. 25% of values fall below Q1. Also called the lower quartile.',
  },
  q3: {
    term: 'Third Quartile (Q3)',
    definition: 'The 75th percentile. 75% of values fall below Q3. Also called the upper quartile.',
  },
  riskRatio: {
    term: 'Risk Ratio (Relative Risk)',
    definition: 'Compares the probability of disease in exposed vs unexposed groups. RR = 1 means no association; RR > 1 suggests increased risk; RR < 1 suggests protective effect.',
  },
  oddsRatio: {
    term: 'Odds Ratio',
    definition: 'Compares the odds of exposure in cases vs controls. OR = 1 means no association; OR > 1 suggests positive association; OR < 1 suggests protective effect.',
  },
  attackRate: {
    term: 'Attack Rate',
    definition: 'The proportion of people who became ill among those at risk. Often expressed as a percentage. In outbreak settings, used synonymously with "risk."',
  },
  confidenceInterval: {
    term: '95% Confidence Interval',
    definition: 'The range of values that likely contains the true population value. If the interval excludes 1.0 (for ratios), the association is statistically significant at p < 0.05.',
  },
  pValue: {
    term: 'P-value',
    definition: 'The probability of seeing results this extreme if there were truly no association. P < 0.05 is typically considered statistically significant.',
  },
  chiSquare: {
    term: 'Chi-Square Test',
    definition: 'Tests whether there is a statistically significant association between two categorical variables. Used with Yates\' correction for 2x2 tables.',
  },
  fisherExact: {
    term: "Fisher's Exact Test",
    definition: 'An exact test for 2x2 tables, preferred when sample sizes are small (typically n < 100 or any expected cell count < 5).',
  },
};
