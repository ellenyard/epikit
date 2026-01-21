import { useState } from 'react';
import { LineListing } from '../analysis/LineListing';
import { EditLogPanel } from './EditLogPanel';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry } from '../../types/analysis';

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

  const currentEditLog = activeDatasetId ? getEditLogForDataset(activeDatasetId) : [];
  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  if (!activeDataset) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="text-sm text-gray-600">
          <span className="font-medium">{activeDataset.records.length}</span> records
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
        {/* Line Listing */}
        <div className={`flex-1 overflow-hidden ${showEditLog ? 'lg:mr-80' : ''}`}>
          <LineListing
            dataset={activeDataset}
            onUpdateRecord={(recordId, updates) => updateRecord(activeDataset.id, recordId, updates)}
            onDeleteRecord={(recordId) => deleteRecord(activeDataset.id, recordId)}
            onAddRecord={(record) => addRecord(activeDataset.id, record)}
            onEditComplete={addEditLogEntry}
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
