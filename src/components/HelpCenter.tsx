import React, { useState } from 'react';

interface HelpCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenOnboarding: () => void;
}

type HelpSection = 'quick-start' | 'faq' | 'privacy' | 'about' | 'saving-sharing';

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
            <button
              onClick={() => setActiveSection('saving-sharing')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'saving-sharing'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Saving & Sharing
            </button>
            <button
              onClick={() => setActiveSection('about')}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                activeSection === 'about'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              About
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
              {activeSection === 'faq' && 'Frequently Asked Questions'}
              {activeSection === 'privacy' && 'Privacy & Data Handling'}
              {activeSection === 'saving-sharing' && 'Saving & Sharing'}
              {activeSection === 'about' && 'About EpiKit'}
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
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">3. Generate Visualizations & Statistics</h4>
                  <div className="prose prose-sm text-gray-600">
                    <p className="mb-3">Use the analysis modules to explore your data:</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">Epi Curve</h5>
                        <p className="text-xs">Visualize temporal distribution of cases to identify outbreak patterns</p>
                      </div>
                      <div className="border border-gray-200 rounded p-3">
                        <h5 className="font-medium text-gray-800 mb-1">Spot Map</h5>
                        <p className="text-xs">Map geographic distribution to identify spatial clusters</p>
                      </div>
                      <div className="border border-gray-200 rounded p-3 md:col-span-2">
                        <h5 className="font-medium text-gray-800 mb-1">Analysis</h5>
                        <p className="text-xs mb-2">Three-step workflow for descriptive and analytical epidemiology:</p>
                        <ul className="text-xs space-y-1 ml-3">
                          <li><strong>Explore:</strong> Single-variable analysis with histograms and descriptive statistics</li>
                          <li><strong>Build Tables:</strong> Create frequency tables and cross-tabulations</li>
                          <li><strong>Test:</strong> 2×2 tables for attack rates, risk ratios, and odds ratios</li>
                        </ul>
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
                      <li>Save your form and export it as JSON</li>
                    </ol>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">5. Exporting Results</h4>
                  <div className="prose prose-sm text-gray-600">
                    <ul className="list-disc ml-6 space-y-2">
                      <li><strong>Export CSV:</strong> Download your cleaned dataset from the dataset selector bar</li>
                      <li><strong>Save Charts:</strong> Use browser print/screenshot for visualizations</li>
                    </ul>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'saving-sharing' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                  <p className="text-blue-800">
                    Guidelines for saving, exporting, and sharing your outbreak analysis work
                  </p>
                </div>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Exporting Your Analysis</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div>
                      <h5 className="font-medium text-gray-800 mb-2 flex items-center">
                        <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Datasets
                      </h5>
                      <p className="mb-2">Export your cleaned dataset as CSV from the dataset selector bar.</p>
                      <ul className="list-disc ml-5 space-y-1 text-gray-600">
                        <li>Includes all edits and derived variables</li>
                        <li>Can be re-imported later to continue work</li>
                        <li>Useful for creating audit trails</li>
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-800 mb-2 flex items-center">
                        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Charts and Visualizations
                      </h5>
                      <p className="mb-2">Save charts using your browser's built-in tools:</p>
                      <ul className="list-disc ml-5 space-y-1 text-gray-600">
                        <li><strong>Right-click:</strong> Use "Save image as..." on most charts</li>
                        <li><strong>Screenshot:</strong> Capture specific sections with screenshot tools</li>
                        <li><strong>Print to PDF:</strong> Use browser print function (Ctrl/Cmd + P) to save as PDF</li>
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-medium text-gray-800 mb-2 flex items-center">
                        <svg className="w-5 h-5 text-orange-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Tables and Statistics
                      </h5>
                      <p className="mb-2">Copy statistical tables into reports:</p>
                      <ul className="list-disc ml-5 space-y-1 text-gray-600">
                        <li>Select table cells and copy (Ctrl/Cmd + C)</li>
                        <li>Paste into spreadsheets or word processors</li>
                        <li>Use screenshots for formatted tables</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Reproducibility Best Practices</h4>
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <svg className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                      <p className="text-sm text-amber-800">
                        <strong>Important:</strong> EpiKit processes data client-side only. To reproduce your analysis, you must document settings and export files manually.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2 mt-0.5">1.</span>
                      <div>
                        <strong>Export Your Cleaned Dataset:</strong> After data quality checks and edits, export the final CSV. This becomes your analytical dataset.
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2 mt-0.5">2.</span>
                      <div>
                        <strong>Document Analysis Settings:</strong> Record key parameters in your report:
                        <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-600">
                          <li>Epi curves: Date variable used, time unit (daily/weekly), stratification variable</li>
                          <li>Spot maps: Coordinate variables, color-by variable, any aggregation applied</li>
                          <li>2×2 tables: Exposure and outcome variables tested, study design (cohort/case-control)</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2 mt-0.5">3.</span>
                      <div>
                        <strong>Save the Edit Log:</strong> The Edit Log documents all data modifications. Screenshot or note key changes for your methods section.
                      </div>
                    </div>

                    <div className="flex items-start">
                      <span className="font-bold text-blue-600 mr-2 mt-0.5">4.</span>
                      <div>
                        <strong>Archive All Materials:</strong> Keep together:
                        <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-600">
                          <li>Original raw data file (if allowed by your data policy)</li>
                          <li>Cleaned/de-identified dataset exported from EpiKit</li>
                          <li>Screenshots of all charts and tables</li>
                          <li>Documentation of analysis settings</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Sharing Your Work Safely</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="bg-green-50 border border-green-200 rounded p-4">
                      <h5 className="font-medium text-green-900 mb-2">✓ Safe to Share</h5>
                      <ul className="space-y-1 text-green-800">
                        <li>• Aggregate statistics and summary tables</li>
                        <li>• Charts without PHI (de-identified epi curves, spot maps with jittered coordinates)</li>
                        <li>• Exported datasets that have been properly de-identified</li>
                        <li>• Analysis methods and settings documentation</li>
                      </ul>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded p-4">
                      <h5 className="font-medium text-red-900 mb-2">✗ Do Not Share</h5>
                      <ul className="space-y-1 text-red-800">
                        <li>• Spot maps showing exact home addresses or precise coordinates</li>
                        <li>• Tables with cells containing fewer than 5 cases (risk of re-identification)</li>
                        <li>• Line listings with identifiable information</li>
                        <li>• Any file containing PHI before de-identification</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeSection === 'about' && (
              <div className="space-y-6 max-w-4xl">
                <div className="bg-gray-50 border-l-4 border-gray-500 p-4">
                  <p className="text-gray-800">
                    Information about EpiKit and how to get support
                  </p>
                </div>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">About EpiKit</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p>
                      EpiKit is a free, open-source web application designed for outbreak investigation and epidemiological analysis.
                      Built for junior epidemiologists and public health professionals, it provides essential tools for data
                      quality assurance and statistical analysis—all without requiring coding skills.
                    </p>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h5 className="font-medium text-blue-900 mb-2">Key Features</h5>
                      <ul className="space-y-1 text-blue-800">
                        <li>• <strong>Client-side processing:</strong> Your data never leaves your computer</li>
                        <li>• <strong>No installation required:</strong> Works directly in your web browser</li>
                        <li>• <strong>Zero cost:</strong> Free to use for all public health professionals</li>
                        <li>• <strong>Privacy-first design:</strong> No server uploads, no cloud storage</li>
                      </ul>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h5 className="font-medium text-gray-800 mb-1">Version</h5>
                        <p className="text-gray-600">1.0.0</p>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <h5 className="font-medium text-gray-800 mb-1">Release Date</h5>
                        <p className="text-gray-600">January 2026</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Getting Help</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p>
                      Need assistance or have questions? Here's how to get support:
                    </p>

                    <div className="space-y-3">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <div>
                          <strong>In-App Tutorials:</strong> Each analysis tool includes a built-in tutorial with step-by-step instructions. Look for the "How to Use This Tool" panel.
                        </div>
                      </div>

                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <div>
                          <strong>FAQ Section:</strong> Check the Frequently Asked Questions for answers to common questions.
                        </div>
                      </div>

                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <div>
                          <strong>Restart Onboarding:</strong> Click the "Restart Onboarding" button at the bottom of this help center to see the introductory wizard again.
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mt-4">
                      <h5 className="font-medium text-gray-800 mb-2">Technical Support</h5>
                      <p className="text-gray-700">
                        For technical issues, bug reports, or feature requests, please contact your system administrator
                        or the development team through your organization's support channels.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="border border-gray-200 rounded-lg p-5 bg-white">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">Citing EpiKit</h4>
                  <div className="space-y-3 text-sm text-gray-700">
                    <p>
                      If you use EpiKit in your outbreak investigations or research, please acknowledge it in your reports:
                    </p>

                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 font-mono text-xs">
                      Data analysis was conducted using EpiKit (version 1.0.0), a web-based epidemiological analysis tool designed for outbreak investigation.
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* OBSOLETE TOOL TUTORIALS SECTION REMOVED - tutorials now embedded on tool pages */}
            {/* OBSOLETE GLOSSARY SECTION REMOVED - definitions now integrated into tool tutorials */}

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
                    answer: 'You can export your cleaned dataset as CSV using the "Export CSV" button. For charts and visualizations, use your browser\'s print or screenshot functionality.'
                  },
                  {
                    id: 'coordinates',
                    question: 'What format should my coordinates be in for spot maps?',
                    answer: 'Latitude and longitude should be in decimal degrees format (e.g., 41.6639, -83.5552). Most mapping services and GPS devices can provide coordinates in this format. Make sure latitude is between -90 and 90, and longitude is between -180 and 180.'
                  },
                  {
                    id: 'attack-rate',
                    question: 'How do I calculate attack rates?',
                    answer: 'Go to the Analysis module and select the "Test" tab. Choose your exposure variable (e.g., "ate potato salad") and outcome variable (e.g., "became ill"). The 2×2 table will automatically calculate attack rates for exposed and unexposed groups, plus risk ratio and statistical significance.'
                  },
                  {
                    id: 'case-status',
                    question: 'What are confirmed, probable, and suspected cases?',
                    answer: 'These are standard case classifications: Confirmed cases meet all criteria including laboratory confirmation. Probable cases meet clinical and epidemiologic criteria without lab confirmation. Suspected cases have some but not all criteria. Your case definition should specify these categories.'
                  },
                  {
                    id: 'data-quality',
                    question: 'What data quality checks does EpiKit perform?',
                    answer: 'EpiKit can check for duplicate records (with fuzzy matching for typos), date order issues (e.g., onset date before exposure date), and numeric range violations (e.g., age outside 0-120). Configure these checks in the Data Quality panel in the Review/Clean module, then click "Run Checks" to identify issues.'
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
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Safe Mapping Practices</h4>
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-5">
                    <div className="flex items-start mb-4">
                      <svg className="w-6 h-6 text-amber-600 mr-3 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <h5 className="font-bold text-amber-900 text-lg mb-2">Important Privacy Considerations for Mapping</h5>
                        <p className="text-amber-800 text-sm mb-3">
                          Spot maps that show precise locations can compromise privacy even when names are removed.
                          Follow these guidelines when creating maps for public sharing or reports.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 text-sm">
                      <div>
                        <h6 className="font-semibold text-amber-900 mb-2">1. Apply Coordinate Jittering</h6>
                        <p className="text-amber-800 mb-2">
                          Add small random offsets to latitude and longitude values (e.g., ±0.001° to ±0.01°) before
                          importing into EpiKit. This obscures exact locations while preserving spatial patterns useful
                          for outbreak investigation.
                        </p>
                        <div className="bg-white border border-amber-200 rounded p-3 font-mono text-xs">
                          Example: 41.6639, -83.5552 → 41.667, -83.558 (jittered)
                        </div>
                      </div>

                      <div>
                        <h6 className="font-semibold text-amber-900 mb-2">2. Use Area-Level Aggregation</h6>
                        <p className="text-amber-800">
                          Instead of plotting individual points, map cases aggregated by:
                        </p>
                        <ul className="list-disc ml-5 mt-1 space-y-1 text-amber-800">
                          <li>ZIP code or postal code</li>
                          <li>Census tract or block group</li>
                          <li>Neighborhood or district</li>
                          <li>Grid cells (e.g., 1km × 1km squares)</li>
                        </ul>
                      </div>

                      <div>
                        <h6 className="font-semibold text-amber-900 mb-2">3. Suppress Small Cells</h6>
                        <p className="text-amber-800 mb-2">
                          <strong>Do not display</strong> individual points if fewer than 5 cases exist in an area.
                          Small numbers combined with geographic precision can enable re-identification, especially in
                          rural areas or small communities.
                        </p>
                        <p className="text-amber-800">
                          Rule of thumb: If showing an area with &lt; 5 cases, aggregate to a larger geographic unit
                          or note "Cases: &lt;5" without showing precise locations.
                        </p>
                      </div>

                      <div>
                        <h6 className="font-semibold text-amber-900 mb-2">4. Be Cautious When Sharing Maps</h6>
                        <p className="text-amber-800">
                          Even with de-identification, screenshots of maps showing precise coordinates can compromise
                          privacy if combined with other information. Consider who will see the map and whether
                          additional privacy protections are needed before sharing outside your response team.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">About the Demo Dataset</h4>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                    <p className="text-blue-800 text-sm mb-3">
                      The foodborne outbreak demo dataset included with EpiKit is <strong>entirely synthetic</strong>
                      and created for training purposes only. It does not represent any real outbreak or actual patient data.
                    </p>
                    <p className="text-blue-800 text-sm">
                      The demo includes 48 fictional case records designed to illustrate common outbreak investigation
                      scenarios and analysis techniques. You can safely explore all EpiKit features with this dataset
                      without any privacy concerns.
                    </p>
                  </div>
                </section>

                <section>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Additional Resources</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
                    <ul className="space-y-3 text-sm text-gray-700">
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <div>
                          <strong>CDC FETP Training Materials:</strong>
                          <p className="text-xs text-gray-600 mt-0.5">Field Epidemiology Training Program resources available on CDC Library Stacks (stacks.cdc.gov)</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <div>
                          <strong>Principles of Epidemiology in Public Health Practice:</strong>
                          <p className="text-xs text-gray-600 mt-0.5">CDC's self-study course covering outbreak investigation methods (SS1978)</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                        </svg>
                        <div>
                          <strong>HIPAA Privacy Rule:</strong>
                          <p className="text-xs text-gray-600 mt-0.5">U.S. Department of Health & Human Services guidance on protected health information</p>
                        </div>
                      </li>
                      <li className="flex items-start">
                        <svg className="w-4 h-4 text-gray-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <span>Consult your organization's IRB or data privacy officer for specific de-identification requirements</span>
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
