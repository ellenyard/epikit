import { useState } from 'react';

interface ReviewHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReviewHelpPanel({ isOpen, onClose }: ReviewHelpPanelProps) {
  const [activeSection, setActiveSection] = useState<string>('overview');

  if (!isOpen) return null;

  const sections = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'filters', label: 'Using Filters', icon: '🔍' },
    { id: 'quality', label: 'Data Quality', icon: '✓' },
    { id: 'variables', label: 'Creating Variables', icon: '➕' },
    { id: 'editing', label: 'Editing Data', icon: '✏️' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Review & Clean Data Guide</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close help panel"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-48 border-r border-gray-200 bg-gray-50 p-4 overflow-y-auto">
            <nav className="space-y-1">
              {sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === section.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-2">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeSection === 'overview' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Welcome to Review & Clean</h3>
                <p className="text-gray-700">
                  The Review & Clean module helps you inspect, validate, and prepare your outbreak data for analysis.
                  This is a critical step in ensuring your epidemiological investigations are based on accurate and complete information.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">Quick Start Workflow</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                    <li>Configure and run data quality checks</li>
                    <li>Review and address any identified issues</li>
                    <li>Apply filters to focus on specific records</li>
                    <li>Edit data directly in the table as needed</li>
                    <li>Create derived variables (e.g., age groups)</li>
                    <li>Track all changes in the Edit Log</li>
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl mb-2">🔍</div>
                    <h4 className="font-semibold text-gray-900 mb-1">Data Quality Panel</h4>
                    <p className="text-sm text-gray-600">
                      Automatically detect duplicates, date order issues, out-of-range values, and missing data
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl mb-2">📊</div>
                    <h4 className="font-semibold text-gray-900 mb-1">Line Listing Table</h4>
                    <p className="text-sm text-gray-600">
                      View, sort, filter, and edit your case records with full tracking
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl mb-2">➕</div>
                    <h4 className="font-semibold text-gray-900 mb-1">Variable Creation</h4>
                    <p className="text-sm text-gray-600">
                      Derive new variables using categorization, formulas, or copying existing fields
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="text-2xl mb-2">📝</div>
                    <h4 className="font-semibold text-gray-900 mb-1">Edit Log</h4>
                    <p className="text-sm text-gray-600">
                      Track every change with reasons, initials, and timestamps for audit trails
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'filters' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Using Filters</h3>
                <p className="text-gray-700">
                  Filters help you focus on specific subsets of your data without permanently removing records.
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Available Filter Operators</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">equals</code>
                      <span className="text-sm text-gray-700">Exact match (case-sensitive)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">not_equals</code>
                      <span className="text-sm text-gray-700">Exclude exact matches</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">contains</code>
                      <span className="text-sm text-gray-700">Partial text match (case-insensitive)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">greater_than</code>
                      <span className="text-sm text-gray-700">For numbers and dates (value &gt; threshold)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">less_than</code>
                      <span className="text-sm text-gray-700">For numbers and dates (value &lt; threshold)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">is_empty</code>
                      <span className="text-sm text-gray-700">Find missing/blank values</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <code className="bg-white px-2 py-1 rounded text-sm font-mono text-blue-600 whitespace-nowrap">is_not_empty</code>
                      <span className="text-sm text-gray-700">Find records with data in this field</span>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-900 mb-2">💡 Example Use Cases</h4>
                  <ul className="space-y-2 text-sm text-amber-800">
                    <li><strong>Find confirmed cases:</strong> Status equals "Confirmed"</li>
                    <li><strong>Find adults:</strong> Age greater_than 17</li>
                    <li><strong>Find recent cases:</strong> Date_onset greater_than 2024-01-01</li>
                    <li><strong>Find incomplete records:</strong> Symptom_onset is_empty</li>
                    <li><strong>Find cases from location:</strong> District contains "Central"</li>
                  </ul>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">🔧 Tips</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
                    <li>You can apply multiple filters at once (they work as AND conditions)</li>
                    <li>Filters don't modify your data - they just hide non-matching records</li>
                    <li>Clear all filters to see your complete dataset again</li>
                    <li>Use filters before exporting to create focused datasets</li>
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'quality' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Data Quality Checks</h3>
                <p className="text-gray-700">
                  Automated checks help identify potential problems in your data before analysis.
                </p>

                <div className="space-y-4">
                  <div className="border-l-4 border-red-400 bg-red-50 p-4">
                    <h4 className="font-semibold text-red-900 mb-2">🔴 Duplicate Detection</h4>
                    <p className="text-sm text-red-800 mb-2">
                      Identifies exact duplicate records that may indicate double-entry or data quality issues.
                    </p>
                    <p className="text-xs text-red-700">
                      <strong>How to configure:</strong> The system automatically checks all fields. Review duplicates and
                      keep the most complete/accurate record or merge information as needed.
                    </p>
                  </div>

                  <div className="border-l-4 border-amber-400 bg-amber-50 p-4">
                    <h4 className="font-semibold text-amber-900 mb-2">📅 Date Order Rules</h4>
                    <p className="text-sm text-amber-800 mb-2">
                      Ensures dates follow logical sequences (e.g., symptom onset before hospitalization).
                    </p>
                    <p className="text-xs text-amber-700 mb-2">
                      <strong>How to configure:</strong> Click "Configure checks" and add rules specifying which dates should come before others.
                    </p>
                    <div className="bg-white rounded p-2 text-xs text-amber-800">
                      <strong>Example:</strong> Exposure Date → Symptom Onset → Lab Test Date → Hospitalization Date
                    </div>
                  </div>

                  <div className="border-l-4 border-blue-400 bg-blue-50 p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">📊 Numeric Range Checks</h4>
                    <p className="text-sm text-blue-800 mb-2">
                      Flags values outside expected ranges (e.g., negative ages, impossible temperatures).
                    </p>
                    <p className="text-xs text-blue-700 mb-2">
                      <strong>How to configure:</strong> Add rules for numeric fields with min/max expected values.
                    </p>
                    <div className="bg-white rounded p-2 text-xs text-blue-800 space-y-1">
                      <div><strong>Age:</strong> 0 to 120 years (negative ages are errors)</div>
                      <div><strong>Temperature:</strong> 35 to 42°C</div>
                      <div><strong>Weight:</strong> 2 to 300 kg</div>
                    </div>
                  </div>

                  <div className="border-l-4 border-purple-400 bg-purple-50 p-4">
                    <h4 className="font-semibold text-purple-900 mb-2">📝 Missing Value Checks</h4>
                    <p className="text-sm text-purple-800 mb-2">
                      Identifies records with empty or missing values in critical fields.
                    </p>
                    <p className="text-xs text-purple-700 mb-2">
                      <strong>How to configure:</strong> Select which fields are essential for your investigation. The system will
                      flag any records missing these values.
                    </p>
                    <div className="bg-white rounded p-2 text-xs text-purple-800">
                      <strong>Tip:</strong> Focus on fields critical for your analysis (e.g., case ID, date of onset, age, location)
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Best Practices</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                    <li>Run checks early and often, especially after importing new data</li>
                    <li>Address errors (red) before warnings (yellow)</li>
                    <li>Click on issues to jump directly to affected records</li>
                    <li>Dismiss false positives to keep your issue list clean</li>
                    <li>Document your decisions in the Edit Log when correcting issues</li>
                  </ul>
                </div>
              </div>
            )}

            {activeSection === 'variables' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Creating Derived Variables</h3>
                <p className="text-gray-700">
                  Create new variables from existing data to support your analysis without modifying original fields.
                </p>

                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 mb-2">📊 Categorization Method</h4>
                    <p className="text-sm text-green-800 mb-3">
                      Group continuous variables (like age or temperature) into categorical ranges.
                    </p>
                    <div className="bg-white rounded-lg p-3 space-y-3">
                      <div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">Example: Age Groups</div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>• 0-4 years (min: 0, max: 4, label: "0-4")</div>
                          <div>• 5-17 years (min: 5, max: 17, label: "5-17")</div>
                          <div>• 18-49 years (min: 18, max: 49, label: "18-49")</div>
                          <div>• 50+ years (min: 50, max: 999, label: "50+")</div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">Example: Fever Status</div>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>• Normal (min: 35, max: 37.5, label: "Normal")</div>
                          <div>• Fever (min: 37.5, max: 50, label: "Fever")</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">🧮 Formula Method</h4>
                    <p className="text-sm text-blue-800 mb-3">
                      Use JavaScript expressions to calculate new values. Reference other fields by their key names.
                    </p>
                    <div className="bg-white rounded-lg p-3 space-y-2 text-xs font-mono">
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 whitespace-nowrap">Age decade:</span>
                        <code className="text-blue-600">Math.floor(age / 10) * 10</code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 whitespace-nowrap">Days to symptom:</span>
                        <code className="text-blue-600">(new Date(symptom_onset) - new Date(exposure_date)) / (1000*60*60*24)</code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 whitespace-nowrap">Full name:</span>
                        <code className="text-blue-600">first_name + " " + last_name</code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 whitespace-nowrap">Is adult:</span>
                        <code className="text-blue-600">age &gt;= 18</code>
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      <strong>Tip:</strong> Test formulas carefully. Invalid expressions will show errors.
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-900 mb-2">📋 Copy Method</h4>
                    <p className="text-sm text-purple-800">
                      Create a duplicate of an existing column. Useful when you need to preserve original data while
                      making changes to a copy.
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Common Epidemiological Variables</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                      <div>• Age groups (pediatric, adult, elderly)</div>
                      <div>• Incubation period categories</div>
                      <div>• Attack rate groups</div>
                      <div>• Symptom count (total symptoms present)</div>
                      <div>• Days from exposure to onset</div>
                      <div>• Case classification (confirmed/probable/suspect)</div>
                      <div>• Geographic region groupings</div>
                      <div>• Time periods (epi weeks, months)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'editing' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Editing Data & Edit Log</h3>
                <p className="text-gray-700">
                  Make corrections and track all changes with full audit trails for transparency and accountability.
                </p>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">How to Edit Data</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
                    <li>Double-click any cell in the line listing table</li>
                    <li>Enter the corrected value</li>
                    <li>Provide a reason for the change (e.g., "Corrected data entry error")</li>
                    <li>Enter your initials for tracking</li>
                    <li>The change is logged automatically with a timestamp</li>
                  </ol>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-900 mb-2">Edit Log Features</h4>
                  <ul className="space-y-2 text-sm text-amber-800">
                    <li><strong>Full Audit Trail:</strong> Every change is recorded with who, what, when, and why</li>
                    <li><strong>Before/After Values:</strong> See exactly what was changed</li>
                    <li><strong>Search & Filter:</strong> Find specific changes by record, field, or person</li>
                    <li><strong>Export Option:</strong> Download the edit log as CSV for external review</li>
                  </ul>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2">✓ Best Practices</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
                    <li>Always provide clear, specific reasons for edits</li>
                    <li>Use consistent initials (e.g., "JD" for John Doe)</li>
                    <li>Review edit log before finalizing analysis</li>
                    <li>Export and archive edit logs with your final reports</li>
                    <li>For major corrections, document decision-making in your investigation notes</li>
                  </ul>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-2">⚠️ Important Notes</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                    <li>Edits cannot be undone once confirmed - double-check before saving</li>
                    <li>The edit log is permanent and cannot be modified or deleted</li>
                    <li>When deleting records, the deletion is logged but the old data is not recoverable</li>
                    <li>Consider making a backup copy of your dataset before major editing sessions</li>
                  </ul>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Common Edit Scenarios</h4>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div>
                      <strong>Typo correction:</strong> "Fixed spelling of location name"
                    </div>
                    <div>
                      <strong>Date format fix:</strong> "Standardized date format from DD/MM/YYYY"
                    </div>
                    <div>
                      <strong>Missing data added:</strong> "Added age from paper form review"
                    </div>
                    <div>
                      <strong>Validation correction:</strong> "Corrected impossible date per follow-up interview"
                    </div>
                    <div>
                      <strong>Classification update:</strong> "Updated status to confirmed per lab result"
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <p className="text-xs text-gray-600">
            💡 Tip: You can access context-specific help by clicking the <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-xs">?</span> icon next to any control
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
