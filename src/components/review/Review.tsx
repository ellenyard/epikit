import { useState, useMemo, useCallback, useEffect } from 'react';
import { LineListing } from '../analysis/LineListing';
import { EditLogPanel } from './EditLogPanel';
import { DataQualityPanel } from './DataQualityPanel';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry, DataQualityIssue, DataQualityConfig } from '../../types/analysis';
import { runDataQualityChecks, getDefaultConfig, autoDetectFieldMapping } from '../../utils/dataQuality';

interface ReviewProps {
  datasets: Dataset[];
  activeDatasetId: string | null;
  setActiveDatasetId: (id: string | null) => void;
  createDataset: (name: string, columns: DataColumn[], records: CaseRecord[], source?: 'import' | 'form') => Dataset;
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
  updateRecord,
  deleteRecord,
  addRecord,
  addEditLogEntry,
  updateEditLogEntry,
  getEditLogForDataset,
  exportEditLog,
}: ReviewProps) {
  const [showEditLog, setShowEditLog] = useState(false);
  const [showDataQuality, setShowDataQuality] = useState(true);
  const [dataQualityIssues, setDataQualityIssues] = useState<DataQualityIssue[]>([]);
  const [dataQualityConfig, setDataQualityConfig] = useState<DataQualityConfig>(getDefaultConfig());
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<DataQualityIssue | null>(null);

  const currentEditLog = activeDatasetId ? getEditLogForDataset(activeDatasetId) : [];
  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  // Auto-detect field mappings when dataset changes
  useEffect(() => {
    if (activeDataset) {
      const detectedMapping = autoDetectFieldMapping(activeDataset.columns);
      setDataQualityConfig(prev => ({
        ...prev,
        fieldMapping: {
          ...detectedMapping,
          ...prev.fieldMapping, // Keep any user overrides
          requiredFields: prev.fieldMapping.requiredFields || [],
        },
      }));
      // Clear issues when dataset changes
      setDataQualityIssues([]);
      setSelectedIssue(null);
    }
  }, [activeDataset?.id]);

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

  if (!activeDataset) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            <span className="font-medium">{activeDataset.records.length}</span> records
          </div>
          <button
            onClick={() => setShowDataQuality(!showDataQuality)}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              showDataQuality
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Data Quality
            {dataQualityIssues.filter(i => !i.dismissed).length > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                {dataQualityIssues.filter(i => !i.dismissed).length}
              </span>
            )}
          </button>
        </div>
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
        {/* Data Quality Panel */}
        {showDataQuality && (
          <div className="hidden lg:block w-72 border-r border-gray-200 bg-white overflow-hidden">
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
        )}

        {/* Line Listing */}
        <div className={`flex-1 overflow-hidden ${showEditLog ? 'lg:mr-80' : ''}`}>
          <LineListing
            dataset={activeDataset}
            onUpdateRecord={(recordId, updates) => updateRecord(activeDataset.id, recordId, updates)}
            onDeleteRecord={(recordId) => deleteRecord(activeDataset.id, recordId)}
            onAddRecord={(record) => addRecord(activeDataset.id, record)}
            onEditComplete={addEditLogEntry}
            highlightedRecordIds={highlightedRecordIds}
            scrollToRecordId={scrollToRecordId}
            highlightField={highlightField}
          />
        </div>

        {/* Edit Log Panel */}
        {showEditLog && (
          <div className="hidden lg:block w-80 border-l border-gray-200 bg-white overflow-y-auto">
            <EditLogPanel
              entries={currentEditLog}
              isOpen={showEditLog}
              onToggle={() => setShowEditLog(!showEditLog)}
              onUpdateEntry={updateEditLogEntry}
              onExport={() => activeDatasetId && exportEditLog(activeDatasetId)}
            />
          </div>
        )}
      </div>

      {/* Mobile Data Quality Panel */}
      {showDataQuality && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowDataQuality(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Data Quality</h2>
              <button onClick={() => setShowDataQuality(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto h-full pb-20">
              <DataQualityPanel
                issues={dataQualityIssues}
                config={dataQualityConfig}
                columns={activeDataset.columns}
                onConfigChange={setDataQualityConfig}
                onRunChecks={runChecks}
                onSelectIssue={(issue) => {
                  handleSelectIssue(issue);
                  setShowDataQuality(false);
                }}
                onDismissIssue={handleDismissIssue}
                isRunning={isRunningChecks}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Edit Log */}
      {showEditLog && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowEditLog(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Edit Log</h2>
              <button onClick={() => setShowEditLog(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto h-full pb-20">
              <EditLogPanel
                entries={currentEditLog}
                isOpen={showEditLog}
                onToggle={() => setShowEditLog(!showEditLog)}
                onUpdateEntry={updateEditLogEntry}
                onExport={() => activeDatasetId && exportEditLog(activeDatasetId)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
