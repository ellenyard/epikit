/**
 * StatTooltip Component
 *
 * Provides contextual help tooltips for statistical measures.
 * Designed to help FETP residents understand statistical outputs.
 *
 * Features:
 * - Hover-triggered tooltip with definition
 * - Optional dynamic interpretation based on actual values
 * - Mobile-friendly positioning (centers on small screens)
 */
import { useState, useRef, useEffect } from 'react';

interface StatTooltipProps {
  /** The term being explained (e.g., "Mean", "Risk Ratio") */
  term: string;
  /** Brief definition of the term */
  definition: string;
  /** Optional dynamic interpretation based on actual values */
  interpretation?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function StatTooltip({ term, definition, interpretation, size = 'sm' }: StatTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);

  const tooltipWidth = interpretation ? 288 : 224; // w-72 = 288px, w-56 = 224px

  // Calculate fixed position based on trigger element
  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const padding = 12; // Minimum padding from viewport edge

      // Start with tooltip centered under the trigger
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      let arrowLeft = tooltipWidth / 2;

      // Adjust if tooltip would overflow on the left
      if (left < padding) {
        arrowLeft = arrowLeft + left - padding;
        left = padding;
      }
      // Adjust if tooltip would overflow on the right
      else if (left + tooltipWidth > viewportWidth - padding) {
        const overflow = left + tooltipWidth - (viewportWidth - padding);
        arrowLeft = arrowLeft + overflow;
        left = viewportWidth - padding - tooltipWidth;
      }

      // Clamp arrow position to stay within tooltip bounds
      arrowLeft = Math.max(12, Math.min(tooltipWidth - 12, arrowLeft));

      setTooltipStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: left,
        width: tooltipWidth,
      });

      setArrowStyle({
        left: arrowLeft,
        transform: 'translateX(-50%) rotate(45deg)',
      });
    }
  }, [isVisible, tooltipWidth]);

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      <button
        type="button"
        className={`${iconSize} text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus:text-gray-600`}
        aria-label={`Help for ${term}`}
      >
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isVisible && (
        <div
          style={tooltipStyle}
          className="z-50 p-3 bg-gray-900 text-white rounded-lg shadow-lg"
          role="tooltip"
        >
          <p className="font-medium text-sm mb-1">{term}</p>
          <p className="text-xs text-gray-300 leading-relaxed">{definition}</p>
          {interpretation && (
            <p className="text-xs text-blue-300 mt-2 pt-2 border-t border-gray-700 leading-relaxed">
              {interpretation}
            </p>
          )}
          {/* Arrow */}
          <div
            style={arrowStyle}
            className="absolute -top-1 w-2 h-2 bg-gray-900"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Pre-defined statistical definitions for common measures.
 * These can be imported and used throughout the app.
 */
export const statDefinitions = {
  // Central Tendency
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

  // Dispersion
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

  // 5-Number Summary
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

  // Epidemiological Measures
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
    definition: 'Tests whether there is a statistically significant association between two categorical variables. Used with Yates\' correction for 2×2 tables.',
  },
  fisherExact: {
    term: "Fisher's Exact Test",
    definition: 'An exact test for 2×2 tables, preferred when sample sizes are small (typically n < 100 or any expected cell count < 5).',
  },
};
