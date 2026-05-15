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
