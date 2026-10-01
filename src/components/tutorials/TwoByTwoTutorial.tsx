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
              that helps you identify risk factors. It cross-classifies people by exposure (exposed or not) and
              outcome (ill or not) so the two groups can be compared.
            </p>
            <p className="text-sm text-gray-700">
              <strong>Attack rate</strong> is the proportion of a group who became ill. Comparing the attack rate
              in the exposed with the attack rate in the unexposed shows whether an exposure is associated with
              illness.
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Running the Analysis</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Choose the analysis type:</strong> Cohort (attack rates and risk ratios) when you have
                  everyone who was at risk, such as all guests at an event. Case-control (odds ratios) when you
                  have cases and a sample of non-cases.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Define the outcome:</strong> Choose the variable that records illness or case status,
                  then tick the values that count as a case. Every other recorded value is treated as not ill (or
                  as a control), so check the Value Mapping box. Blank outcomes are left out.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Select exposures:</strong> Choose one or more potential risk factors (e.g., "ate potato
                  salad"). Under each one, check which value means "exposed". Common codings such as Yes/No, Y/N,
                  Oui/Non or 1/0 are recognised; otherwise you are asked to choose. For a variable with more than
                  two values, also choose the comparison group.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">4.</span>
                <div>
                  <strong>Read the summary table:</strong> Each exposure is one row, showing the two groups being
                  compared, the counts and attack rates (or the cases and controls exposed), the risk ratio or
                  odds ratio with its 95% confidence interval, and a p-value. You can work out the four cells of
                  the 2×2 table from the counts and totals shown.
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
                  <strong className="text-orange-900">Attack Rate:</strong> (Number ill in a group) ÷ (Total in that
                  group), expressed as a percentage. Example: "60% of people who ate potato salad became ill."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-blue-900">Risk Ratio (RR):</strong> Attack rate in exposed ÷ attack rate in
                  unexposed. RR = 1 means the same risk in both groups; RR &gt; 1 means higher risk in the exposed;
                  RR &lt; 1 means lower risk in the exposed. Example: "RR = 3.5 means exposed people were 3.5 times
                  as likely to become ill as unexposed people." If no one in the unexposed group became ill, the RR
                  cannot be calculated and is shown as Undefined.
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-green-900">95% Confidence Interval (CI):</strong> A range of values for
                  the true RR (or OR) that is compatible with your data. A wide interval means the estimate is
                  imprecise. If the CI includes 1.0, the data are also compatible with no association.
                  Example: "RR = 3.5 (95% CI 1.8-6.8)".
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-purple-900">p-value:</strong> From the chi-square test with Yates'
                  continuity correction. When any expected cell count is below 5 the chi-square test is unreliable,
                  so Fisher's exact test (two-sided) is shown instead and marked ‡. p &lt; 0.05 is conventionally
                  called statistically significant, but statistical significance is not the same as public health
                  importance.
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-red-900">Odds Ratio (OR):</strong> The measure of association for
                  case-control studies: the odds of exposure among cases ÷ the odds of exposure among controls.
                  OR &gt; 1 means exposure was more common among cases. If a cell of the table is zero the OR
                  cannot be calculated directly; the value shown then adds 0.5 to every cell and is marked †.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Interpreting Results</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <h5 className="font-medium text-green-900 mb-2">Evidence of an Association</h5>
                <ul className="text-sm text-green-800 space-y-1 ml-4">
                  <li>• RR (or OR) well above 1.0 with a CI that doesn't include 1.0</li>
                  <li>• Low p-value (&lt; 0.05)</li>
                  <li>• Large difference in attack rates between exposed and unexposed</li>
                  <li>• Most cases can be accounted for by the exposure: a suspect vehicle worth investigating further</li>
                </ul>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <h5 className="font-medium text-yellow-900 mb-2">No Clear Association</h5>
                <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                  <li>• RR close to 1.0, or a CI that includes 1.0</li>
                  <li>• p-value of 0.05 or more</li>
                  <li>• This does not prove there is no effect: with small numbers a real association can be missed</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <h5 className="font-medium text-blue-900 mb-2">Lower Risk in the Exposed</h5>
                <ul className="text-sm text-blue-800 space-y-1 ml-4">
                  <li>• RR &lt; 1.0 with a CI that doesn't include 1.0</li>
                  <li>• Lower attack rate in exposed than unexposed</li>
                  <li>• May reflect a protective exposure (e.g., vaccination), or simply that people who ate one
                    item did not eat the contaminated one</li>
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
                  <li>• Check that the "exposed" value and comparison group named in each row are the ones you intend</li>
                  <li>• Be cautious with small cell counts (&lt; 5)—estimates are imprecise and intervals are wide</li>
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
