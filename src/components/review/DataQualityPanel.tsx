import { useState, useMemo } from 'react';
import type {
  DataQualityIssue,
  DataQualityConfig,
  DataQualityCheckType,
  DataColumn,
} from '../../types/analysis';
import {
  getCheckName,
  getCategoryName,
  groupIssuesByCategory,
} from '../../utils/dataQuality';

interface DataQualityPanelProps {
  issues: DataQualityIssue[];
  config: DataQualityConfig;
  columns: DataColumn[];
  onConfigChange: (config: DataQualityConfig) => void;
  onRunChecks: () => void;
  onSelectIssue: (issue: DataQualityIssue) => void;
  onDismissIssue: (issueId: string) => void;
  isRunning: boolean;
}

type CategoryKey = DataQualityIssue['category'];

export function DataQualityPanel({
  issues,
  config,
  columns,
  onConfigChange,
  onRunChecks,
  onSelectIssue,
  onDismissIssue,
  isRunning,
}: DataQualityPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<CategoryKey>>(
    new Set(['duplicate', 'temporal', 'logic', 'completeness', 'range'])
  );
  const [showConfig, setShowConfig] = useState(false);

  // Filter out dismissed issues for display
  const activeIssues = useMemo(
    () => issues.filter(i => !i.dismissed),
    [issues]
  );

  const groupedIssues = useMemo(
    () => groupIssuesByCategory(activeIssues),
    [activeIssues]
  );

  const toggleCategory = (category: CategoryKey) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const errorCount = activeIssues.filter(i => i.severity === 'error').length;
  const warningCount = activeIssues.filter(i => i.severity === 'warning').length;

  const updateFieldMapping = (field: string, value: string) => {
    onConfigChange({
      ...config,
      fieldMapping: {
        ...config.fieldMapping,
        [field]: value || undefined,
      },
    });
  };

  const toggleCheck = (checkType: DataQualityCheckType) => {
    const enabled = config.enabledChecks.includes(checkType);
    onConfigChange({
      ...config,
      enabledChecks: enabled
        ? config.enabledChecks.filter(c => c !== checkType)
        : [...config.enabledChecks, checkType],
    });
  };

  const updateRequiredFields = (fields: string[]) => {
    onConfigChange({
      ...config,
      fieldMapping: {
        ...config.fieldMapping,
        requiredFields: fields,
      },
    });
  };

  const allChecks: DataQualityCheckType[] = [
    'duplicate_exact',
    'duplicate_key',
    'temporal_onset_after_exposure',
    'temporal_onset_before_report',
    'temporal_death_after_onset',
    'temporal_future_date',
    'logic_confirmed_needs_positive',
    'logic_hospitalized_needs_hospital',
    'logic_deceased_needs_date',
    'completeness_required',
    'range_age',
  ];

  const fieldMappingFields: { key: string; label: string; type: 'date' | 'text' | 'any' }[] = [
    { key: 'onsetDate', label: 'Symptom Onset Date', type: 'date' },
    { key: 'exposureDate', label: 'Exposure Date', type: 'date' },
    { key: 'reportDate', label: 'Report Date', type: 'date' },
    { key: 'deathDate', label: 'Death Date', type: 'date' },
    { key: 'caseId', label: 'Case ID', type: 'text' },
    { key: 'fullName', label: 'Full Name', type: 'text' },
    { key: 'firstName', label: 'First Name', type: 'text' },
    { key: 'lastName', label: 'Last Name', type: 'text' },
    { key: 'age', label: 'Age', type: 'any' },
    { key: 'caseStatus', label: 'Case Status', type: 'any' },
    { key: 'labResult', label: 'Lab Result', type: 'any' },
    { key: 'hospitalized', label: 'Hospitalized', type: 'any' },
    { key: 'hospitalName', label: 'Hospital Name', type: 'text' },
    { key: 'outcome', label: 'Outcome', type: 'any' },
  ];

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Data Quality</h3>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded transition-colors ${
              showConfig ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Configure checks"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Summary */}
        {activeIssues.length > 0 ? (
          <div className="flex items-center gap-3 text-sm">
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errorCount} errors
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {warningCount} warnings
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {issues.length > 0 ? 'All issues reviewed' : 'No issues found'}
          </p>
        )}
      </div>

      {/* Configuration Panel */}
      {showConfig && (
        <div className="border-b border-gray-200 bg-gray-50 max-h-96 overflow-auto">
          <div className="p-4 space-y-4">
            {/* Field Mapping */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Field Mapping
              </h4>
              <div className="space-y-2">
                {fieldMappingFields.map(({ key, label, type }) => (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 w-28 truncate" title={label}>
                      {label}
                    </label>
                    <select
                      value={(config.fieldMapping as Record<string, string | undefined>)[key] || ''}
                      onChange={(e) => updateFieldMapping(key, e.target.value)}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="">-- Not mapped --</option>
                      {columns
                        .filter(c => type === 'any' || c.type === type || c.type === 'text')
                        .map(c => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Fields */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Required Fields
              </h4>
              <div className="flex flex-wrap gap-1">
                {columns.map(col => (
                  <label
                    key={col.key}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                      config.fieldMapping.requiredFields?.includes(col.key)
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={config.fieldMapping.requiredFields?.includes(col.key) || false}
                      onChange={(e) => {
                        const current = config.fieldMapping.requiredFields || [];
                        if (e.target.checked) {
                          updateRequiredFields([...current, col.key]);
                        } else {
                          updateRequiredFields(current.filter(f => f !== col.key));
                        }
                      }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Enabled Checks */}
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Enabled Checks
              </h4>
              <div className="space-y-1">
                {allChecks.map(check => (
                  <label
                    key={check}
                    className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={config.enabledChecks.includes(check)}
                      onChange={() => toggleCheck(check)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {getCheckName(check)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run Checks Button */}
      <div className="px-4 py-3 border-b border-gray-200">
        <button
          onClick={onRunChecks}
          disabled={isRunning}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Run Checks
            </>
          )}
        </button>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-auto">
        {(['duplicate', 'temporal', 'logic', 'completeness', 'range'] as CategoryKey[]).map(category => {
          const categoryIssues = groupedIssues[category];
          if (categoryIssues.length === 0) return null;

          const isExpanded = expandedCategories.has(category);
          const categoryErrors = categoryIssues.filter(i => i.severity === 'error').length;
          const categoryWarnings = categoryIssues.filter(i => i.severity === 'warning').length;

          return (
            <div key={category} className="border-b border-gray-100">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">
                    {getCategoryName(category)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {categoryErrors > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                      {categoryErrors}
                    </span>
                  )}
                  {categoryWarnings > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded">
                      {categoryWarnings}
                    </span>
                  )}
                </div>
              </button>

              {/* Category Issues */}
              {isExpanded && (
                <div className="pb-2">
                  {categoryIssues.map(issue => (
                    <div
                      key={issue.id}
                      className="mx-2 mb-1 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => onSelectIssue(issue)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            {issue.severity === 'error' ? (
                              <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className="text-xs font-medium text-gray-900">
                              {issue.message}
                            </span>
                          </div>
                          {issue.details && (
                            <p className="text-xs text-gray-500 mt-0.5 ml-5">
                              {issue.details}
                            </p>
                          )}
                          <p className="text-xs text-blue-600 mt-0.5 ml-5">
                            {issue.recordIds.length === 1
                              ? 'Click to view record'
                              : `${issue.recordIds.length} records affected`}
                          </p>
                        </button>
                        <button
                          onClick={() => onDismissIssue(issue.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                          title="Dismiss issue"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {activeIssues.length === 0 && !isRunning && (
          <div className="p-8 text-center text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">
              {issues.length > 0 ? 'All issues have been reviewed' : 'Click "Run Checks" to analyze data'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
