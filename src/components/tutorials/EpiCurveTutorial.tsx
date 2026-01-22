import React, { useState } from 'react';

export const EpiCurveTutorial: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-blue-200 rounded-lg bg-blue-50 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-blue-100 transition-colors rounded-lg"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 text-lg">How to Use This Tool</h3>
            <p className="text-sm text-blue-700">Click to view step-by-step guidance</p>
          </div>
        </div>
        <svg
          className={`w-6 h-6 text-blue-700 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="bg-white border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              What is an Epidemic Curve?
            </h4>
            <p className="text-sm text-gray-700 mb-3">
              An epidemic curve (epi curve) is a histogram showing the number of cases over time. It's one of the most
              important tools in outbreak investigation, helping you visualize when cases occurred and identify
              patterns in disease transmission.
            </p>
          </div>

          <div className="bg-white border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">Creating Your Epi Curve</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-blue-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Select a Date Variable:</strong> Choose the variable that represents when cases occurred
                  (typically "date of illness onset" or "symptom onset date"). Avoid using administrative dates like
                  "date interviewed" or "date reported" as these don't reflect the true temporal distribution.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Choose Time Unit:</strong> Select an appropriate time interval (hour, day, week, or month).
                  For acute outbreaks, use hours or days. For longer investigations, use weeks or months.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Add Stratification (Optional):</strong> Select a grouping variable to color-code your bars
                  (e.g., by case status, sex, or exposure). This helps identify patterns within subgroups.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-600 mr-2 mt-0.5">4.</span>
                <div>
                  <strong>Review Your Chart:</strong> The chart will update automatically. Look for the overall pattern
                  and shape of the curve to understand the outbreak dynamics.
                </div>
              </li>
            </ol>
          </div>

          <div className="bg-white border border-blue-200 rounded-lg p-4">
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

          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-amber-900 mb-1">Pro Tips</h5>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Use the smallest practical time unit—too large masks patterns, too small creates noise</li>
                  <li>• Pay attention to gaps or unusual patterns that might indicate data quality issues</li>
                  <li>• Compare the curve shape with known incubation periods to identify likely pathogens</li>
                  <li>• Export your chart for reports using browser print or screenshot tools</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
