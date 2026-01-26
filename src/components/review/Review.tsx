/**
 * Review/Clean Module
 *
 * This module is the data cleaning and quality control center. It combines:
 *
 * 1. LINE LISTING (center panel)
 *    - Spreadsheet-like view of all records
 *    - Inline editing with double-click
 *    - Sort, filter, and search capabilities
 *    - Add/delete records
 *
 * 2. DATA QUALITY PANEL (left sidebar)
 *    - Configurable data quality checks:
 *      • Duplicate detection (with fuzzy matching for typos)
 *      • Date order validation (e.g., onset before hospitalization)
 *      • Numeric range checks (e.g., age 0-120)
 *    - Click issues to highlight affected records
 *    - Dismiss reviewed issues
 *
 * 3. EDIT LOG (right sidebar)
 *    - Tracks all data modifications
 *    - Records: what changed, old/new values, reason, timestamp
 *    - Exportable for audit trail
 *
 * 4. VARIABLE CREATION (modal)
 *    - Create new variables from existing ones
 *    - Methods: categorize (bins), formula, copy, blank
 *
 * All edits are logged and can be exported for reproducibility.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { LineListing } from '../analysis/LineListing';
import { EditLogPanel } from './EditLogPanel';
import { DataQualityPanel } from './DataQualityPanel';
import { CreateVariableModal } from './CreateVariableModal';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry, DataQualityIssue, DataQualityConfig, VariableConfig, FilterCondition, NumericRangeRule } from '../../types/analysis';
import { runDataQualityChecks, getDefaultConfig } from '../../utils/dataQuality';
import { addVariableToDataset } from '../../utils/variableCreation';
import { ReviewCleanTutorial } from '../tutorials/ReviewCleanTutorial';

interface ReviewProps {
  datasets: Dataset[];
  activeDatasetId: string | null;
  setActiveDatasetId: (id: string | null) => void;
  createDataset: (name: string, columns: DataColumn[], records: CaseRecord[], source?: 'import' | 'form') => Dataset;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  deleteDataset: (id: string) => void;
  addRecord: (datasetId: string, record: Omit<CaseRecord, 'id'>) => CaseRecord;
  updateRecord: (datasetId: string, recordId: string, updates: Partial<CaseRecord>) => void;
  deleteRecord: (datasetId: string, recordId: string) => void;
  addEditLogEntry: (entry: EditLogEntry) => void;
  updateEditLogEntry: (id: string, updates: Partial<EditLogEntry>) => void;
  getEditLogForDataset: (datasetId: string) => EditLogEntry[];
  exportEditLog: (datasetId: string) => void;
}

export function Review({
  datasets,
  activeDatasetId,
  updateDataset,
  updateRecord,
  deleteRecord,
  addRecord,
  addEditLogEntry,
  updateEditLogEntry,
  getEditLogForDataset,
  exportEditLog,
}: ReviewProps) {
  // ---------------------------------------------------------------------------
  // UI STATE
  // ---------------------------------------------------------------------------
  const [showEditLog, setShowEditLog] = useState(false);
  const [showCreateVariable, setShowCreateVariable] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  // ---------------------------------------------------------------------------
  // DATA QUALITY STATE
  // Issues are generated when user clicks "Run Checks" with their config
  // ---------------------------------------------------------------------------
  const [dataQualityIssues, setDataQualityIssues] = useState<DataQualityIssue[]>([]);
  const [dataQualityConfig, setDataQualityConfig] = useState<DataQualityConfig>(getDefaultConfig());
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<DataQualityIssue | null>(null);

  // ---------------------------------------------------------------------------
  // FILTER STATE
  // Filters applied to the line listing view
  // ---------------------------------------------------------------------------
  const [filters, setFilters] = useState<FilterCondition[]>([]);

  // Get current dataset and its edit log
  const currentEditLog = activeDatasetId ? getEditLogForDataset(activeDatasetId) : [];
  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  // Clear issues and auto-detect numeric range rules when dataset changes
  useEffect(() => {
    if (activeDataset) {
      setDataQualityIssues([]);
      setSelectedIssue(null);

      // Auto-detect common numeric fields and add default range rules
      const defaultRanges: Record<string, { min: number; max: number }> = {
        age: { min: 0, max: 120 },
        temperature: { min: 35, max: 43 }, // Celsius body temp
        temp: { min: 35, max: 43 },
        weight: { min: 0, max: 500 }, // kg
        height: { min: 0, max: 300 }, // cm
        bmi: { min: 10, max: 60 },
        pulse: { min: 20, max: 250 },
        heart_rate: { min: 20, max: 250 },
        systolic: { min: 50, max: 250 },
        diastolic: { min: 30, max: 150 },
        respiratory_rate: { min: 5, max: 60 },
        oxygen_saturation: { min: 50, max: 100 },
        spo2: { min: 50, max: 100 },
      };

      const autoRules: NumericRangeRule[] = [];

      for (const col of activeDataset.columns) {
        if (col.type === 'number') {
          const keyLower = col.key.toLowerCase().replace(/[_-]/g, '');

          // Check if column name matches any default range
          for (const [pattern, range] of Object.entries(defaultRanges)) {
            if (keyLower === pattern || keyLower.includes(pattern)) {
              autoRules.push({
                id: `auto-${col.key}`,
                field: col.key,
                fieldLabel: col.label,
                min: range.min,
                max: range.max,
              });
              break; // Only add one rule per column
            }
          }
        }
      }

      // Update config with auto-detected rules (preserve any user-added rules)
      if (autoRules.length > 0) {
        setDataQualityConfig(prev => ({
          ...prev,
          numericRangeRules: [
            ...autoRules,
            // Keep any user rules that aren't auto-detected fields
            ...prev.numericRangeRules.filter(r => !r.id.startsWith('auto-')),
          ],
        }));
      }
    }
  }, [activeDataset?.id, activeDataset?.columns]);

  // Get highlighted record IDs from active issues
  const highlightedRecordIds = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of dataQualityIssues) {
      if (!issue.dismissed) {
        for (const id of issue.recordIds) {
          ids.add(id);
        }
      }
    }
    return ids;
  }, [dataQualityIssues]);

  // Get scroll target from selected issue
  const scrollToRecordId = selectedIssue?.recordIds[0] || null;
  const highlightField = selectedIssue?.field;

  const runChecks = useCallback(() => {
    if (!activeDataset) return;

    setIsRunningChecks(true);
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      const issues = runDataQualityChecks(
        activeDataset.records,
        activeDataset.columns,
        dataQualityConfig
      );
      setDataQualityIssues(issues);
      setIsRunningChecks(false);
    }, 50);
  }, [activeDataset, dataQualityConfig]);

  const handleSelectIssue = useCallback((issue: DataQualityIssue) => {
    setSelectedIssue(issue);
    // Clear selection after a delay
    setTimeout(() => setSelectedIssue(null), 3000);
  }, []);

  const handleDismissIssue = useCallback((issueId: string) => {
    setDataQualityIssues(prev =>
      prev.map(i => i.id === issueId ? { ...i, dismissed: true } : i)
    );
  }, []);

  const handleCreateVariable = useCallback((config: VariableConfig, values: unknown[]) => {
    if (!activeDataset) return;

    const updatedDataset = addVariableToDataset(activeDataset, config, values);
    updateDataset(activeDataset.id, {
      columns: updatedDataset.columns,
      records: updatedDataset.records,
    });

    // Add entry to edit log
    addEditLogEntry({
      id: crypto.randomUUID(),
      datasetId: activeDataset.id,
      recordId: 'system',
      recordIdentifier: 'System',
      columnKey: config.name,
      columnLabel: config.label,
      oldValue: null,
      newValue: `Created new variable: ${config.label}`,
      reason: `Variable created via ${config.method} method`,
      initials: 'SYS',
      timestamp: new Date().toISOString(),
    });
  }, [activeDataset, updateDataset, addEditLogEntry]);

  const addFilter = useCallback(() => {
    if (!activeDataset || activeDataset.columns.length === 0) return;
    setFilters(prev => [...prev, {
      column: activeDataset.columns[0].key,
      operator: 'contains',
      value: '',
    }]);
  }, [activeDataset]);

  const updateFilter = useCallback((index: number, updates: Partial<FilterCondition>) => {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  }, []);

  if (!activeDataset) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Mobile Toolbar - visible only on small screens */}
      <div className="lg:hidden flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setShowMobilePanel(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Tools
        </button>
        <button
          onClick={() => setShowEditLog(!showEditLog)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            showEditLog
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 bg-white border border-gray-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Log
          {currentEditLog.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
              {currentEditLog.length}
            </span>
          )}
        </button>
      </div>

      {/* Desktop Toolbar - visible only on large screens */}
      <div className="hidden lg:flex items-center justify-end gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setShowEditLog(!showEditLog)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            showEditLog
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Edit Log
          {currentEditLog.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
              {currentEditLog.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mobile Left Panel Overlay */}
        {showMobilePanel && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowMobilePanel(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[90vw] bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Tools & Data Quality</h2>
                <button onClick={() => setShowMobilePanel(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Mobile Controls Section */}
              <div className="border-b border-gray-200 bg-white">
                <div className="p-4 space-y-3">
                  {/* Tutorial Component */}
                  <div className="mb-3">
                    <ReviewCleanTutorial />
                  </div>

                  {/* Filter Button */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`w-full px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      filters.length > 0
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      Filters {filters.length > 0 && `(${filters.length})`}
                    </div>
                  </button>

                  {/* Mobile Filter Panel */}
                  {showFilters && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="space-y-2">
                        {filters.map((filter, index) => (
                          <div key={index} className="space-y-2">
                            <select
                              value={filter.column}
                              onChange={(e) => updateFilter(index, { column: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              {activeDataset.columns.map(col => (
                                <option key={col.key} value={col.key}>{col.label}</option>
                              ))}
                            </select>
                            <select
                              value={filter.operator}
                              onChange={(e) => updateFilter(index, { operator: e.target.value as FilterCondition['operator'] })}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="contains">contains</option>
                              <option value="equals">equals</option>
                              <option value="not_equals">not equals</option>
                              <option value="greater_than">greater than</option>
                              <option value="less_than">less than</option>
                              <option value="is_empty">is empty</option>
                              <option value="is_not_empty">is not empty</option>
                            </select>
                            {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                              <input
                                type="text"
                                value={String(filter.value)}
                                onChange={(e) => updateFilter(index, { value: e.target.value })}
                                placeholder="Value"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            )}
                            <button
                              onClick={() => removeFilter(index)}
                              className="w-full px-2 py-1 text-xs text-red-600 hover:text-red-700"
                            >
                              Remove filter
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addFilter}
                          className="w-full text-sm text-blue-600 hover:text-blue-700 py-1"
                        >
                          + Add filter
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Create Variable Button */}
                  <button
                    onClick={() => { setShowCreateVariable(true); setShowMobilePanel(false); }}
                    className="w-full px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Variable
                    </div>
                  </button>

                  {/* Add Record Button */}
                  <button
                    onClick={() => { setShowAddRow(true); setShowMobilePanel(false); }}
                    className="w-full px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Record
                    </div>
                  </button>
                </div>
              </div>

              {/* Mobile Data Quality Panel */}
              <div className="flex-1 overflow-y-auto">
                <DataQualityPanel
                  issues={dataQualityIssues}
                  config={dataQualityConfig}
                  columns={activeDataset.columns}
                  onConfigChange={setDataQualityConfig}
                  onRunChecks={runChecks}
                  onSelectIssue={(issue) => { handleSelectIssue(issue); setShowMobilePanel(false); }}
                  onDismissIssue={handleDismissIssue}
                  isRunning={isRunningChecks}
                />
              </div>
            </div>
          </div>
        )}

        {/* Desktop Left Panel - Controls and Data Quality */}
        <div className="hidden lg:block w-72 border-r border-gray-200 bg-white overflow-y-auto flex flex-col">
          {/* Controls Section */}
          <div className="border-b border-gray-200 bg-white">
            <div className="p-4 space-y-3">
              {/* Tutorial Component */}
              <div className="mb-3">
                <ReviewCleanTutorial />
              </div>

              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`w-full px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  filters.length > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters {filters.length > 0 && `(${filters.length})`}
                </div>
              </button>

              {/* Filter Panel */}
              {showFilters && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-2">
                    {filters.map((filter, index) => (
                      <div key={index} className="space-y-2">
                        <select
                          value={filter.column}
                          onChange={(e) => updateFilter(index, { column: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          {activeDataset.columns.map(col => (
                            <option key={col.key} value={col.key}>{col.label}</option>
                          ))}
                        </select>
                        <select
                          value={filter.operator}
                          onChange={(e) => updateFilter(index, { operator: e.target.value as FilterCondition['operator'] })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="contains">contains</option>
                          <option value="equals">equals</option>
                          <option value="not_equals">not equals</option>
                          <option value="greater_than">greater than</option>
                          <option value="less_than">less than</option>
                          <option value="is_empty">is empty</option>
                          <option value="is_not_empty">is not empty</option>
                        </select>
                        {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                          <input
                            type="text"
                            value={String(filter.value)}
                            onChange={(e) => updateFilter(index, { value: e.target.value })}
                            placeholder="Value"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        )}
                        <button
                          onClick={() => removeFilter(index)}
                          className="w-full px-2 py-1 text-xs text-red-600 hover:text-red-700"
                        >
                          Remove filter
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addFilter}
                      className="w-full text-sm text-blue-600 hover:text-blue-700 py-1"
                    >
                      + Add filter
                    </button>
                  </div>
                </div>
              )}

              {/* Create Variable Button */}
              <button
                onClick={() => setShowCreateVariable(true)}
                className="w-full px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create Variable
                </div>
              </button>

              {/* Add Record Button */}
              <button
                onClick={() => setShowAddRow(true)}
                className="w-full px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Record
                </div>
              </button>
            </div>
          </div>

          {/* Data Quality Panel */}
          <div className="flex-1 overflow-y-auto">
            <DataQualityPanel
              issues={dataQualityIssues}
              config={dataQualityConfig}
              columns={activeDataset.columns}
              onConfigChange={setDataQualityConfig}
              onRunChecks={runChecks}
              onSelectIssue={handleSelectIssue}
              onDismissIssue={handleDismissIssue}
              isRunning={isRunningChecks}
            />
          </div>
        </div>

        {/* Line Listing */}
        <div className="flex-1 overflow-hidden">
          <LineListing
            dataset={activeDataset}
            onUpdateRecord={(recordId, updates) => updateRecord(activeDataset.id, recordId, updates)}
            onDeleteRecord={(recordId) => deleteRecord(activeDataset.id, recordId)}
            onAddRecord={(record) => addRecord(activeDataset.id, record)}
            onEditComplete={addEditLogEntry}
            highlightedRecordIds={highlightedRecordIds}
            scrollToRecordId={scrollToRecordId}
            highlightField={highlightField}
            filters={filters}
            showAddRow={showAddRow}
            onShowAddRowChange={setShowAddRow}
          />
        </div>
      </div>

      {/* Edit Log Sidebar */}
      <EditLogPanel
        entries={currentEditLog}
        isOpen={showEditLog}
        onToggle={() => setShowEditLog(!showEditLog)}
        onUpdateEntry={updateEditLogEntry}
        onExport={() => activeDatasetId && exportEditLog(activeDatasetId)}
      />

      {/* Create Variable Modal */}
      <CreateVariableModal
        isOpen={showCreateVariable}
        onClose={() => setShowCreateVariable(false)}
        existingColumns={activeDataset.columns}
        records={activeDataset.records}
        onCreateVariable={handleCreateVariable}
      />
    </div>
  );
}
