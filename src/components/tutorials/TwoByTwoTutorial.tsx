import React, { useState } from 'react';

export const TwoByTwoTutorial: React.FC = () => {
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
            <h4 className="font-semibold text-gray-800 mb-3">What are 2×2 Tables & Attack Rates?</h4>
            <p className="text-sm text-gray-700 mb-3">
              A 2×2 contingency table (also called a two-by-two table) is a fundamental tool in outbreak investigation
              that helps you identify risk factors. It compares illness rates between exposed and unexposed groups to
              determine if an exposure is associated with disease.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Attack rate</strong> is the proportion of exposed people who became ill. Comparing attack rates
              between exposed and unexposed groups reveals whether an exposure increases disease risk.
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Creating Your 2×2 Table</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Select Exposure Variable:</strong> Choose the variable representing a potential risk factor
                  (e.g., "ate potato salad", "swam in pool", "attended event"). This should be a Yes/No or binary
                  variable.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Select Outcome Variable:</strong> Choose the variable indicating illness status (e.g., "case
                  status", "became ill"). This should also be binary (Ill/Not Ill, Case/Control, etc.).
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Review the Table:</strong> The 2×2 table will display four cells showing counts of
                  exposed-ill, exposed-not ill, unexposed-ill, and unexposed-not ill.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">4.</span>
                <div>
                  <strong>Interpret Results:</strong> Review attack rates, risk ratio, confidence intervals, and
                  p-values to assess the strength and significance of the association.
                </div>
              </li>
            </ol>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Understanding the Statistics</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-orange-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-orange-900">Attack Rate:</strong> Proportion of exposed (or unexposed) who
                  became ill. Formula: (Number ill) ÷ (Total exposed). Expressed as percentage. Example: "60% of people
                  who ate potato salad became ill."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-blue-900">Risk Ratio (RR):</strong> Attack rate in exposed ÷ attack rate in
                  unexposed. RR = 1 means no association; RR &gt; 1 means exposure increases risk; RR &lt; 1 means
                  exposure is protective. Example: "RR = 3.5 means exposed people were 3.5 times more likely to become
                  ill."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-green-900">95% Confidence Interval (CI):</strong> Range of plausible values
                  for the true RR. If the CI includes 1.0, the association may not be statistically significant.
                  Example: "RR = 3.5 (95% CI: 1.8-6.8)" suggests a real association.
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-purple-900">Chi-square Test & P-value:</strong> Tests whether the association
                  is statistically significant. P &lt; 0.05 conventionally indicates significance. However, statistical
                  significance doesn't always equal public health importance.
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-red-900">Odds Ratio (OR):</strong> Alternative measure of association, more
                  appropriate for case-control studies. Interpretation similar to RR: OR &gt; 1 indicates increased
                  odds with exposure.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Interpreting Results</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <h5 className="font-medium text-green-900 mb-2">Strong Positive Association</h5>
                <ul className="text-sm text-green-800 space-y-1 ml-4">
                  <li>• High RR (&gt; 2.0) with CI that doesn't include 1.0</li>
                  <li>• Low p-value (&lt; 0.05)</li>
                  <li>• Large difference in attack rates between exposed and unexposed</li>
                  <li>• Likely a significant risk factor—investigate further!</li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <h5 className="font-medium text-yellow-900 mb-2">Weak or Non-significant Association</h5>
                <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                  <li>• RR close to 1.0</li>
                  <li>• CI includes 1.0</li>
                  <li>• High p-value (&gt; 0.05)</li>
                  <li>• Exposure probably not a risk factor</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <h5 className="font-medium text-blue-900 mb-2">Protective Effect</h5>
                <ul className="text-sm text-blue-800 space-y-1 ml-4">
                  <li>• RR &lt; 1.0 with CI that doesn't include 1.0</li>
                  <li>• Lower attack rate in exposed than unexposed</li>
                  <li>• Suggests exposure may be protective (e.g., vaccination, avoiding contaminated food)</li>
                </ul>
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
                  <li>• Test multiple exposures to identify all potential risk factors</li>
                  <li>• Be cautious with small cell counts (&lt; 5)—results may be unreliable</li>
                  <li>• Statistical significance doesn't prove causation—consider biological plausibility</li>
                  <li>• Document all tested associations, not just significant ones, to avoid reporting bias</li>
                  <li>• Consider dose-response relationships (low/medium/high exposure) for stronger evidence</li>
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
