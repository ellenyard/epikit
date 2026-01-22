import React, { useState } from 'react';

interface HelpCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenOnboarding: () => void;
}

type HelpSection = 'quick-start' | 'tools' | 'glossary' | 'faq' | 'privacy';

export const HelpCenter: React.FC<HelpCenterProps> = ({
  isOpen,
  onClose,
  onOpenOnboarding,
}) => {
  const [activeSection, setActiveSection] = useState<HelpSection>('quick-start');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-center-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 id="help-center-title" className="text-lg font-semibold text-gray-800 flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help & Tutorials
            </h2>
          </div>

          <nav className="flex-1 overflow-y-auto p-2" aria-label="Help sections">
            <button
              onClick={() => setActiveSection('quick-start')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'quick-start'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Quick Start Guide
            </button>
            <button
              onClick={() => setActiveSection('tools')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'tools'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Tool Tutorials
            </button>
            <button
              onClick={() => setActiveSection('glossary')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'glossary'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Glossary
            </button>
            <button
              onClick={() => setActiveSection('faq')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'faq'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              FAQ
            </button>
            <button
              onClick={() => setActiveSection('privacy')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'privacy'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Privacy & Data
            </button>
          </nav>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={onOpenOnboarding}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              Restart Onboarding
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800">
              {activeSection === 'quick-start' && 'Quick Start Guide'}
              {activeSection === 'tools' && 'Tool Tutorials'}
              {activeSection === 'glossary' && 'Epidemiology Glossary'}
              {activeSection === 'faq' && 'Frequently Asked Questions'}
              {activeSection === 'privacy' && 'Privacy & Data Handling'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close help center"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'quick-start' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                  <p className="text-blue-800">
                    <strong>Welcome to EpiKit!</strong> This guide will help you get started with outbreak investigation and analysis.
                  </p>
                </div>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">1. Importing Your Data</h4>
                  <div className="prose prose-sm text-gray-600">
                    <p className="mb-3">To analyze data in EpiKit:</p>
                    <ol className="list-decimal ml-6 space-y-2">
                      <li>Navigate to any analysis module (Review/Clean, Epi Curve, Spot Map, etc.)</li>
                      <li>Click the <strong>"Import Data"</strong> button in the dataset selector bar</li>
                      <li>Select your CSV file (ensure it's de-identified—no PHI!)</li>
                      <li>Review the preview to verify columns are detected correctly</li>
                      <li>Click "Import Dataset" to load your data</li>
                    </ol>
                    <div className="bg-amber-50 border border-amber-300 rounded p-3 mt-3">
                      <p className="text-amber-800 text-sm">
                        <strong>💡 Tip:</strong> CSV files should have column headers in the first row and use comma separators.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">2. Review & Clean Your Data</h4>
                  <div className="prose prose-sm text-gray-600">
                    <p className="mb-3">Before analysis, always check data quality:</p>
                    <ul className="list-disc ml-6 space-y-2">
                      <li><strong>Data Quality Tab:</strong> Identifies duplicates, missing values, and date order issues</li>
                      <li><strong>Line Listing Tab:</strong> View and edit individual records</li>
                      <li><strong>Create Variable:</strong> Derive new variables (e.g., age groups, incubation period)</li>
                      <li><strong>Edit Log:</strong> Track all changes made to the dataset</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">3. Generate Visualizations</h4>
                  <div className="prose prose-sm text-gray-600">
                    <p className="mb-3">Use the analysis modules to explore your data:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">Epi Curve</h5>
                        <p className="text-xs">Visualize temporal distribution of cases</p>
                      </div>
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">Spot Map</h5>
                        <p className="text-xs">Map geographic distribution of cases</p>
                      </div>
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">Descriptive Stats</h5>
                        <p className="text-xs">Calculate summary statistics</p>
                      </div>
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">2×2 Tables</h5>
                        <p className="text-xs">Calculate attack rates and risk ratios</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">4. Building Custom Forms</h4>
                  <div className="prose prose-sm text-gray-600">
                    <p className="mb-3">Create data collection instruments:</p>
                    <ol className="list-decimal ml-6 space-y-2">
                      <li>Navigate to the <strong>Forms</strong> module</li>
                      <li>Drag field types from the palette onto the canvas</li>
                      <li>Configure field properties (label, options, validation, help text)</li>
                      <li>Use <strong>Skip Logic</strong> to show/hide fields based on answers</li>
                      <li>Save your form and use it in the <strong>Collect</strong> module</li>
                    </ol>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">5. Exporting Results</h4>
                  <div className="prose prose-sm text-gray-600">
                    <ul className="list-disc ml-6 space-y-2">
                      <li><strong>Export CSV:</strong> Download your cleaned dataset from the dataset selector bar</li>
                      <li><strong>Save Charts:</strong> Use browser print/screenshot for visualizations</li>
                      <li><strong>Export Forms:</strong> Download form definitions as JSON files</li>
                    </ul>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'tools' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-green-50 border-l-4 border-green-500 p-4">
                  <p className="text-green-800">
                    Detailed guides for each analysis tool in EpiKit
                  </p>
                </div>

                {/* Epi Curve Tutorial */}
                <section className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">Epidemic Curve (Epi Curve)</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        An epidemic curve is a histogram showing the number of cases over time.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium mb-1">How to Create an Epi Curve:</h5>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Select a <strong>Date Variable</strong> (e.g., date of illness onset)</li>
                        <li>Choose an optional <strong>Grouping Variable</strong> (e.g., case status, sex)</li>
                        <li>Set the <strong>Time Unit</strong> (hour, day, week, month)</li>
                        <li>The chart will update automatically</li>
                      </ol>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1">Interpreting the Curve:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li><strong>Point source:</strong> Sharp peak, rapid rise and fall</li>
                        <li><strong>Continuous/common source:</strong> Plateau with sustained elevation</li>
                        <li><strong>Propagated/person-to-person:</strong> Multiple peaks spaced by incubation period</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Spot Map Tutorial */}
                <section className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">Spot Map</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        A geographic visualization showing the spatial distribution of cases.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium mb-1">How to Create a Spot Map:</h5>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Select <strong>Latitude</strong> and <strong>Longitude</strong> variables</li>
                        <li>Optionally select a <strong>Color By</strong> variable (e.g., case status)</li>
                        <li>Cases will appear as colored markers on the map</li>
                        <li>Zoom and pan to explore spatial patterns</li>
                      </ol>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1">What to Look For:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>Clustering of cases suggesting common exposure site</li>
                        <li>Geographic patterns (e.g., along water source, near facility)</li>
                        <li>Outliers that may represent different exposure routes</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Descriptive Stats Tutorial */}
                <section className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">Descriptive Statistics</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Summary measures (mean, median, range) for numeric variables.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium mb-1">Available Statistics:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li><strong>Mean:</strong> Average value</li>
                        <li><strong>Median:</strong> Middle value when sorted</li>
                        <li><strong>Min/Max:</strong> Smallest and largest values</li>
                        <li><strong>Range:</strong> Difference between min and max</li>
                        <li><strong>Count:</strong> Number of non-missing values</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1">Common Uses:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>Age distribution of cases</li>
                        <li>Incubation period calculations</li>
                        <li>Duration of illness</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* 2x2 Tables Tutorial */}
                <section className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">2×2 Tables & Attack Rates</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Calculate attack rates and statistical associations between exposures and illness.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium mb-1">How to Use:</h5>
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Select an <strong>Exposure Variable</strong> (e.g., "ate potato salad")</li>
                        <li>Select an <strong>Outcome Variable</strong> (e.g., "case status")</li>
                        <li>Review the 2×2 contingency table</li>
                        <li>Interpret attack rates, risk ratio, and confidence intervals</li>
                      </ol>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1">Key Metrics:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li><strong>Attack Rate:</strong> Proportion of exposed who became ill</li>
                        <li><strong>Risk Ratio (RR):</strong> Attack rate in exposed ÷ attack rate in unexposed</li>
                        <li><strong>95% CI:</strong> Confidence interval for the risk ratio</li>
                        <li><strong>Chi-square & p-value:</strong> Statistical significance test</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Review/Clean Tutorial */}
                <section className="border border-gray-200 rounded-lg p-5">
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">Review & Clean Data</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Identify and fix data quality issues before analysis.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium mb-1">Data Quality Checks:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li><strong>Duplicate Detection:</strong> Identifies potential duplicate records</li>
                        <li><strong>Missing Values:</strong> Shows variables with incomplete data</li>
                        <li><strong>Date Order Issues:</strong> Finds illogical date sequences</li>
                        <li><strong>Outliers:</strong> Highlights extreme values</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium mb-1">Data Editing Features:</h5>
                      <ul className="list-disc ml-5 space-y-1">
                        <li>Click cells to edit values inline</li>
                        <li>Provide reason for changes (tracked in Edit Log)</li>
                        <li>Create new variables from existing data</li>
                        <li>Filter and search records</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'glossary' && (
              <div className="space-y-4 max-w-4xl">
                <div className="bg-purple-50 border-l-4 border-purple-500 p-4">
                  <p className="text-purple-800">
                    Common epidemiological terms and concepts used in outbreak investigations
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Attack Rate</h4>
                    <p className="text-sm text-gray-600">
                      The proportion of people who develop illness among those exposed to a specific risk factor
                      (e.g., ate a particular food). Calculated as: (number of exposed who became ill) ÷ (total number exposed).
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Case Definition</h4>
                    <p className="text-sm text-gray-600">
                      A set of standard criteria for classifying individuals as cases. Usually includes clinical criteria
                      (symptoms), person (who), place (where), and time (when). May be classified as confirmed, probable, or suspected.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Confidence Interval (CI)</h4>
                    <p className="text-sm text-gray-600">
                      A range of values that likely contains the true population parameter. A 95% CI means if we repeated
                      the study 100 times, 95 of those intervals would contain the true value.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Epidemic Curve (Epi Curve)</h4>
                    <p className="text-sm text-gray-600">
                      A histogram showing the distribution of cases over time. The shape can provide clues about
                      the mode of transmission (point source, continuous, propagated).
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Incubation Period</h4>
                    <p className="text-sm text-gray-600">
                      The time between exposure to an infectious agent and the onset of symptoms. Different pathogens
                      have characteristic incubation periods that can help identify the likely causative agent.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Odds Ratio (OR)</h4>
                    <p className="text-sm text-gray-600">
                      The odds of exposure among cases divided by the odds of exposure among controls.
                      Used in case-control studies. OR &gt; 1 suggests positive association; OR &lt; 1 suggests protective effect.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Outbreak</h4>
                    <p className="text-sm text-gray-600">
                      The occurrence of more cases of disease than expected in a given area or among a specific
                      group of people over a particular period of time.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">P-value</h4>
                    <p className="text-sm text-gray-600">
                      The probability of observing results at least as extreme as those observed, assuming there is
                      no true association. Conventionally, p &lt; 0.05 is considered statistically significant.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Risk Ratio (RR) / Relative Risk</h4>
                    <p className="text-sm text-gray-600">
                      The attack rate in the exposed group divided by the attack rate in the unexposed group.
                      RR &gt; 1 indicates increased risk with exposure; RR &lt; 1 indicates decreased risk.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Spot Map</h4>
                    <p className="text-sm text-gray-600">
                      A map showing the geographic distribution of cases. Used to identify spatial clustering
                      and potential environmental sources of exposure.
                    </p>
                  </div>

                  <div className="border-b border-gray-200 pb-4">
                    <h4 className="font-semibold text-gray-800 mb-1">Statistical Significance</h4>
                    <p className="text-sm text-gray-600">
                      The likelihood that an observed association occurred by chance alone. Typically assessed
                      using p-values or confidence intervals. Does not necessarily indicate clinical or public health importance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'faq' && (
              <div className="space-y-3 max-w-4xl">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                  <p className="text-blue-800">
                    Answers to common questions about using EpiKit
                  </p>
                </div>

                {/* FAQ Items */}
                {[
                  {
                    id: 'import',
                    question: 'How do I import my data?',
                    answer: 'Navigate to any analysis module and click the "Import Data" button in the dataset selector bar. Select your CSV file and click "Import Dataset". Make sure your CSV has column headers in the first row and uses comma separators.'
                  },
                  {
                    id: 'storage',
                    question: 'Is my data stored on the server?',
                    answer: 'No! All data processing happens entirely in your web browser (client-side). Your data never leaves your computer. EpiKit does not upload data to any server or cloud storage. Data exists only in browser memory and is cleared when you close the tab.'
                  },
                  {
                    id: 'phi',
                    question: 'Can I upload data with Protected Health Information (PHI)?',
                    answer: 'No, you should NOT upload data containing PHI such as names, addresses, dates of birth, SSNs, or other direct identifiers. Always de-identify your data before importing it into EpiKit. Use case IDs instead of names, generalize dates and locations, and follow your organization\'s data handling policies.'
                  },
                  {
                    id: 'date-variable',
                    question: 'How do I choose a date variable for my epi curve?',
                    answer: 'Select the date variable that best represents when cases occurred, typically "date of illness onset" or "symptom onset date". Avoid using dates like "date interviewed" or "date reported" as these may not accurately reflect the temporal distribution of the outbreak.'
                  },
                  {
                    id: 'missing-data',
                    question: 'What happens if my data has missing values?',
                    answer: 'EpiKit will identify missing values in the Data Quality panel. Missing values are excluded from calculations. For critical variables (like date of onset), you may need to follow up with data sources to obtain complete information.'
                  },
                  {
                    id: 'export',
                    question: 'How do I save my analysis results?',
                    answer: 'You can export your cleaned dataset as CSV using the "Export CSV" button. For charts and visualizations, use your browser\'s print or screenshot functionality. Forms can be exported as JSON files from the Forms module.'
                  },
                  {
                    id: 'coordinates',
                    question: 'What format should my coordinates be in for spot maps?',
                    answer: 'Latitude and longitude should be in decimal degrees format (e.g., 41.6639, -83.5552). Most mapping services and GPS devices can provide coordinates in this format. Make sure latitude is between -90 and 90, and longitude is between -180 and 180.'
                  },
                  {
                    id: 'skip-logic',
                    question: 'How does skip logic work in forms?',
                    answer: 'Skip logic allows you to show or hide form fields based on previous answers. In the form builder, configure a field\'s "Show If" conditions to specify when it should appear. For example, show "Which symptoms?" only if "Experienced symptoms" is "Yes".'
                  },
                  {
                    id: 'attack-rate',
                    question: 'How do I calculate attack rates?',
                    answer: 'Use the 2×2 Tables module. Select your exposure variable (e.g., "ate potato salad") and outcome variable (e.g., "became ill"). The table will automatically calculate attack rates for exposed and unexposed groups, plus risk ratio and statistical significance.'
                  },
                  {
                    id: 'case-status',
                    question: 'What are confirmed, probable, and suspected cases?',
                    answer: 'These are standard case classifications: Confirmed cases meet all criteria including laboratory confirmation. Probable cases meet clinical and epidemiologic criteria without lab confirmation. Suspected cases have some but not all criteria. Your case definition should specify these categories.'
                  },
                  {
                    id: 'data-quality',
                    question: 'What data quality checks does EpiKit perform?',
                    answer: 'EpiKit checks for duplicate records (based on ID fields), missing values, date order issues (e.g., onset before exposure), and outliers in numeric fields. Review these in the Data Quality panel before conducting your analysis.'
                  },
                  {
                    id: 'create-variable',
                    question: 'How do I create age groups or other derived variables?',
                    answer: 'In the Review/Clean module, use the "Create Variable" feature. You can create age groups, calculate incubation periods, combine symptoms, or create any custom variable based on your existing data fields.'
                  }
                ].map((faq) => (
                  <div key={faq.id} className="border border-gray-200 rounded-lg">
                    <button
                      onClick={() => toggleFAQ(faq.id)}
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                      aria-expanded={expandedFAQ === faq.id}
                    >
                      <span className="font-medium text-gray-800 pr-4">{faq.question}</span>
                      <svg
                        className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform ${
                          expandedFAQ === faq.id ? 'transform rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expandedFAQ === faq.id && (
                      <div className="px-5 pb-4">
                        <p className="text-sm text-gray-600">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-red-50 border-l-4 border-red-500 p-4">
                  <p className="text-red-800 font-medium">
                    Important information about data privacy and security in EpiKit
                  </p>
                </div>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Data Handling Policy</h4>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-5">
                    <h5 className="font-semibold text-green-900 mb-3 flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Client-Side Processing Only
                    </h5>
                    <ul className="space-y-2 text-green-800 text-sm">
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span>All data processing occurs in your web browser</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span>Your data never leaves your computer</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span>No server uploads or cloud storage</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span>Data stored only in browser memory (RAM)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">✓</span>
                        <span>Data is cleared when you close the browser tab</span>
                      </li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Protected Health Information (PHI)</h4>
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-5">
                    <div className="flex items-start mb-4">
                      <svg className="w-6 h-6 text-red-600 mr-3 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <h5 className="font-bold text-red-900 text-lg mb-2">DO NOT Upload PHI</h5>
                        <p className="text-red-800 text-sm mb-3">
                          Even though EpiKit processes data client-side, you should NEVER upload data containing PHI.
                          This protects against accidental disclosure and ensures compliance with privacy regulations.
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-red-800">
                      <p className="font-medium mb-2">PHI includes (but is not limited to):</p>
                      <div className="grid md:grid-cols-2 gap-2 ml-4">
                        <ul className="space-y-1">
                          <li>• Names</li>
                          <li>• Addresses (full street address)</li>
                          <li>• Dates of birth</li>
                          <li>• Phone numbers</li>
                          <li>• Email addresses</li>
                        </ul>
                        <ul className="space-y-1">
                          <li>• Social Security Numbers</li>
                          <li>• Medical record numbers</li>
                          <li>• Photos or images</li>
                          <li>• License plate numbers</li>
                          <li>• Biometric identifiers</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">De-identification Best Practices</h4>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                    <p className="text-blue-800 text-sm mb-4">
                      Before importing data into EpiKit, follow these de-identification guidelines:
                    </p>
                    <div className="space-y-3 text-sm text-blue-800">
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 text-xs font-bold">
                          1
                        </div>
                        <div>
                          <h5 className="font-medium mb-1">Replace Names with IDs</h5>
                          <p className="text-xs">Use case numbers or participant IDs instead of names (e.g., "CASE001", "PARTICIPANT_042")</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 text-xs font-bold">
                          2
                        </div>
                        <div>
                          <h5 className="font-medium mb-1">Generalize Locations</h5>
                          <p className="text-xs">Use ZIP code, census tract, or neighborhood instead of full addresses. For maps, round coordinates to reduce precision (e.g., 2-3 decimal places).</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 text-xs font-bold">
                          3
                        </div>
                        <div>
                          <h5 className="font-medium mb-1">Generalize Dates</h5>
                          <p className="text-xs">Remove exact dates of birth. Use year only or age groups (e.g., "0-4", "5-9", "10-14").</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 text-xs font-bold">
                          4
                        </div>
                        <div>
                          <h5 className="font-medium mb-1">Remove or Redact</h5>
                          <p className="text-xs">Delete columns containing PHI (phone, email, SSN, medical record number) before export/import.</p>
                        </div>
                      </div>
                      <div className="flex items-start">
                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0 mr-3 mt-0.5 text-xs font-bold">
                          5
                        </div>
                        <div>
                          <h5 className="font-medium mb-1">Follow Organizational Policies</h5>
                          <p className="text-xs">Consult your IRB, ethics board, or data privacy officer for specific de-identification requirements.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Recommended Uses</h4>
                  <div className="space-y-3">
                    <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                      <h5 className="font-medium text-green-900 mb-2 flex items-center">
                        <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Safe Uses
                      </h5>
                      <ul className="text-sm text-green-800 space-y-1 ml-7">
                        <li>• De-identified outbreak investigation data</li>
                        <li>• Aggregate or summarized data</li>
                        <li>• Training with simulated/demo datasets</li>
                        <li>• Data that has undergone formal de-identification review</li>
                      </ul>
                    </div>

                    <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                      <h5 className="font-medium text-red-900 mb-2 flex items-center">
                        <svg className="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Unsafe Uses
                      </h5>
                      <ul className="text-sm text-red-800 space-y-1 ml-7">
                        <li>• Raw data containing names or addresses</li>
                        <li>• Data with medical record numbers</li>
                        <li>• Data with dates of birth or SSNs</li>
                        <li>• Any data that could re-identify individuals</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Additional Resources</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <span><strong>HIPAA:</strong> U.S. Department of Health & Human Services - HIPAA Privacy Rule</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <span><strong>CDC:</strong> Guidelines for outbreak investigation and data management</span>
                      </li>
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <span>Consult your organization's IRB or data privacy officer for specific requirements</span>
                      </li>
                    </ul>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
