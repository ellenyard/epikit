import React, { useState } from 'react';

export const EpiCurveTutorial: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-900">How to Use This Tool</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 py-4 bg-white border-t border-gray-200">
          <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">What is an Epidemic Curve?</h4>
            <p className="text-sm text-gray-700 mb-3">
              An epidemic curve (epi curve) is a histogram showing the number of cases over time. It's one of the most
              important tools in outbreak investigation, helping you visualize when cases occurred and identify
              patterns in disease transmission.
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Creating Your Epi Curve</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Select a Date Variable:</strong> Choose the variable that represents when cases occurred
                  (typically "date of illness onset" or "symptom onset date"). Avoid using administrative dates like
                  "date interviewed" or "date reported" as these don't reflect the true temporal distribution.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Choose Time Unit:</strong> Select an appropriate time interval (hour, day, week, or month).
                  For acute outbreaks, use hours or days. For longer investigations, use weeks or months.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Add Stratification (Optional):</strong> Select a grouping variable to color-code your bars
                  (e.g., by case status, sex, or exposure). This helps identify patterns within subgroups.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">4.</span>
                <div>
                  <strong>Review Your Chart:</strong> The chart will update automatically. Look for the overall pattern
                  and shape of the curve to understand the outbreak dynamics.
                </div>
              </li>
            </ol>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Interpreting Curve Patterns</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-blue-900">Point Source Outbreak:</strong> A sharp peak with rapid rise and
                  fall, resembling a bell curve. Suggests all cases were exposed at roughly the same time (e.g., from
                  contaminated food at a single event).
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-green-900">Continuous/Common Source:</strong> A plateau with sustained
                  elevation over time. Suggests ongoing exposure to a common source (e.g., contaminated water supply).
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-purple-900">Propagated/Person-to-Person:</strong> Multiple peaks spaced by
                  the incubation period, with each wave representing successive generations of transmission. Common in
                  infectious diseases with person-to-person spread.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-gray-900 mb-1">Pro Tips</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Use the smallest practical time unit—too large masks patterns, too small creates noise</li>
                  <li>• Pay attention to gaps or unusual patterns that might indicate data quality issues</li>
                  <li>• Compare the curve shape with known incubation periods to identify likely pathogens</li>
                  <li>• Export your chart for reports using browser print or screenshot tools</li>
                </ul>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
