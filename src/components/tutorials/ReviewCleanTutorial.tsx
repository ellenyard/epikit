import React, { useState } from 'react';

export const ReviewCleanTutorial: React.FC = () => {
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
            <h4 className="font-semibold text-gray-800 mb-3">Why Review & Clean Your Data?</h4>
            <p className="text-sm text-gray-700 mb-3">
              Data quality issues are extremely common in outbreak investigations. Errors, duplicates, missing values,
              and inconsistencies can lead to incorrect conclusions. <strong>Always start with Review & Clean before
              conducting any analysis.</strong>
            </p>
            <p className="text-sm text-gray-700">
              This module helps you systematically identify and fix data quality problems, ensuring your analysis is
              based on clean, reliable data.
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Key Features</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 font-bold text-xs">
                  1
                </div>
                <div>
                  <h5 className="font-medium text-gray-800 mb-1">Data Quality Panel</h5>
                  <p className="text-gray-600">
                    Automatically identifies potential issues:
                  </p>
                  <ul className="mt-1 ml-4 space-y-1">
                    <li>• <strong>Duplicate records:</strong> Cases with identical IDs or matching demographics</li>
                    <li>• <strong>Missing values:</strong> Variables with incomplete data and completeness percentages</li>
                    <li>• <strong>Date order issues:</strong> Illogical date sequences (e.g., onset before exposure)</li>
                    <li>• <strong>Outliers:</strong> Extreme values that may indicate data entry errors</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 font-bold text-xs">
                  2
                </div>
                <div>
                  <h5 className="font-medium text-gray-800 mb-1">Line Listing Tab</h5>
                  <p className="text-gray-600">
                    View and edit individual records in a spreadsheet-like interface:
                  </p>
                  <ul className="mt-1 ml-4 space-y-1">
                    <li>• Click any cell to edit its value</li>
                    <li>• Provide a reason for each change (tracked in Edit Log)</li>
                    <li>• Filter and search records</li>
                    <li>• Problematic records are highlighted automatically</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 font-bold text-xs">
                  3
                </div>
                <div>
                  <h5 className="font-medium text-gray-800 mb-1">Create Variable</h5>
                  <p className="text-gray-600">
                    Derive new variables from existing data:
                  </p>
                  <ul className="mt-1 ml-4 space-y-1">
                    <li>• <strong>Age groups:</strong> Categorize continuous age into ranges (0-4, 5-9, etc.)</li>
                    <li>• <strong>Incubation period:</strong> Calculate time between exposure and onset</li>
                    <li>• <strong>Symptom combinations:</strong> Create new variables based on multiple symptoms</li>
                    <li>• <strong>Custom calculations:</strong> Any derived variable based on your data</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 font-bold text-xs">
                  4
                </div>
                <div>
                  <h5 className="font-medium text-gray-800 mb-1">Edit Log Panel</h5>
                  <p className="text-gray-600">
                    Complete audit trail of all data modifications:
                  </p>
                  <ul className="mt-1 ml-4 space-y-1">
                    <li>• Tracks what was changed, when, and why</li>
                    <li>• Documents data cleaning decisions for reproducibility</li>
                    <li>• Can be exported for quality assurance and reporting</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Recommended Workflow</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Check Data Quality Panel First:</strong> Review all flagged issues. Prioritize fixing
                  duplicates (can inflate case counts) and date order problems (affect epi curves).
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Handle Duplicates:</strong> Investigate flagged duplicates. If truly duplicate, delete one
                  copy. If not duplicate (e.g., twins, household members), ensure they have unique IDs.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Address Missing Values:</strong> For critical variables (onset date, case status), follow up
                  with data sources. For less critical variables, document completeness in your report.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">4.</span>
                <div>
                  <strong>Verify Outliers:</strong> Check extreme values (very old/young ages, impossible coordinates).
                  Confirm with original data source or correct if clearly erroneous.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">5.</span>
                <div>
                  <strong>Create Derived Variables:</strong> Use Create Variable feature to add age groups, incubation
                  periods, or other calculated fields needed for analysis.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">6.</span>
                <div>
                  <strong>Document Changes:</strong> Always provide clear reasons when editing. The Edit Log is your
                  quality assurance record and demonstrates methodological rigor.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">7.</span>
                <div>
                  <strong>Export Clean Data:</strong> Once cleaning is complete, export your cleaned dataset using
                  "Export CSV" so you have a clean baseline for all subsequent analyses.
                </div>
              </li>
            </ol>
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-gray-900 mb-2">Common Pitfalls to Avoid</h5>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li>
                    <strong>• Don't skip data quality checks:</strong> Analyzing dirty data leads to false conclusions.
                    Always start with Review & Clean.
                  </li>
                  <li>
                    <strong>• Don't delete records without investigation:</strong> What looks like a duplicate or
                    outlier may be a legitimate case. Always verify before deleting.
                  </li>
                  <li>
                    <strong>• Don't edit without documenting:</strong> Provide clear, specific reasons for all changes.
                    "Fixed error" is too vague—write "Corrected onset date from 2/31 to 3/1 based on case report."
                  </li>
                  <li>
                    <strong>• Don't ignore systematic patterns:</strong> If you see many similar errors (e.g., all
                    dates in MM/DD/YYYY when you expected YYYY-MM-DD), this indicates a systematic issue to address.
                  </li>
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
                  <li>• Clean data in stages: duplicates → missing values → outliers → derived variables</li>
                  <li>• Consult with data collectors to clarify ambiguous or inconsistent entries</li>
                  <li>• Keep your original raw data file unchanged—only edit within EpiKit</li>
                  <li>• Save the Edit Log and include key cleaning decisions in your outbreak report methods</li>
                  <li>• Re-run Data Quality checks after making corrections to ensure issues are resolved</li>
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
