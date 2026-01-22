import React, { useState } from 'react';

export const DescriptiveStatsTutorial: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-purple-200 rounded-lg bg-purple-50 mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-purple-100 transition-colors rounded-lg"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center">
          <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-purple-900 text-lg">How to Use This Tool</h3>
            <p className="text-sm text-purple-700">Click to view step-by-step guidance</p>
          </div>
        </div>
        <svg
          className={`w-6 h-6 text-purple-700 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              What are Descriptive Statistics?
            </h4>
            <p className="text-sm text-gray-700">
              Descriptive statistics summarize numeric data using measures like mean, median, and range. They provide a
              quick overview of your data's central tendency and spread, helping you understand patterns and identify
              potential issues in outbreak investigations.
            </p>
          </div>

          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">Generating Summary Statistics</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-purple-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Select a Numeric Variable:</strong> Choose the variable you want to analyze (e.g., age,
                  incubation period, duration of illness). The tool only works with numeric variables.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-purple-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Add Grouping (Optional):</strong> Select a categorical variable to break down statistics by
                  subgroups (e.g., calculate mean age separately for males and females, or by case status).
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-purple-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Review Results:</strong> The table will automatically display summary statistics. Missing
                  values are excluded from calculations.
                </div>
              </li>
            </ol>
          </div>

          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">Understanding the Statistics</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-purple-900">Mean (Average):</strong> Sum of all values divided by count.
                  Useful for normally distributed data, but sensitive to outliers. For age: "The average age of cases
                  was 42 years."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-blue-900">Median (Middle Value):</strong> The value that divides the data in
                  half when sorted. More robust than mean when outliers are present. "Half of cases were younger than
                  38 years."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-green-900">Min/Max:</strong> Smallest and largest values in the dataset.
                  Useful for identifying the age range, earliest/latest onset dates, or potential data errors.
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-orange-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-orange-900">Range:</strong> Difference between max and min (Max - Min).
                  Indicates spread: "Cases ranged from 5 to 85 years old (range = 80 years)."
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-red-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-red-900">Count:</strong> Number of non-missing values included in the
                  calculations. Important for assessing data completeness.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">Common Uses in Outbreak Investigations</h4>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Age Distribution:</strong> Calculate mean/median age to identify disproportionately affected
                  age groups (e.g., elderly in nursing home outbreak).
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Incubation Period:</strong> Calculate median incubation period to help identify likely
                  pathogens (e.g., median 24 hours suggests bacterial foodborne illness).
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Duration of Illness:</strong> Summarize how long people were sick to characterize outbreak
                  severity and burden.
                </div>
              </div>
              <div className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <strong>Comparing Subgroups:</strong> Use grouping to compare statistics between cases and controls,
                  or between confirmed and probable cases.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-amber-900 mb-1">Pro Tips</h5>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>• Always check the count—low counts indicate missing data that may bias results</li>
                  <li>• If mean and median differ substantially, check for outliers or data entry errors</li>
                  <li>• Consider creating age groups (via Review/Clean) rather than using continuous age</li>
                  <li>• Compare your statistics to known pathogen characteristics to narrow differential diagnosis</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
