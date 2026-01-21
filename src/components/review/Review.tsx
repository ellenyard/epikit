import { useState } from 'react';
import { DataImport } from '../analysis/DataImport';
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
  setActiveDatasetId,
  createDataset,
  deleteDataset,
  addRecord,
  updateRecord,
  deleteRecord,
  addEditLogEntry,
  updateEditLogEntry,
  getEditLogForDataset,
  exportEditLog,
}: ReviewProps) {
  const [showImport, setShowImport] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showEditLog, setShowEditLog] = useState(false);

  const currentEditLog = activeDatasetId ? getEditLogForDataset(activeDatasetId) : [];

  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  const handleImport = (name: string, columns: DataColumn[], records: CaseRecord[]) => {
    createDataset(name, columns, records, 'import');
    setShowImport(false);
  };

  const handleSelectDataset = (id: string) => {
    setActiveDatasetId(id);
    setShowSidebar(false);
  };

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Mobile toolbar */}
      <div className="lg:hidden flex items-center gap-2 p-2 bg-white border-b border-gray-200">
        <button
          onClick={() => setShowSidebar(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Datasets
        </button>
        {activeDataset && (
          <span className="text-sm text-gray-500 truncate">
            {activeDataset.name}
          </span>
        )}
        <button
          onClick={() => setShowImport(true)}
          className="ml-auto p-2 text-blue-600 hover:text-blue-700"
          title="Import Data"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Dataset Sidebar */}
        <div className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Datasets
              </h2>
              <button
                onClick={() => setShowImport(true)}
                className="p-1 text-blue-600 hover:text-blue-700"
                title="Import Data"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {datasets.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No datasets yet</p>
                <button
                  onClick={() => setShowImport(true)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Import your first dataset
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                      activeDatasetId === dataset.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveDatasetId(dataset.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate ${
                          activeDatasetId === dataset.id ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {dataset.name}
                        </p>
                        {dataset.source === 'form' && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            Form
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {dataset.records.length} records &bull; {dataset.columns.length} columns
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete dataset "${dataset.name}"?`)) {
                          deleteDataset(dataset.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Datasets</h2>
                <button onClick={() => setShowSidebar(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {datasets.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-sm">No datasets yet</p>
                    <button
                      onClick={() => { setShowImport(true); setShowSidebar(false); }}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      Import your first dataset
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {datasets.map((dataset) => (
                      <div
                        key={dataset.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer ${
                          activeDatasetId === dataset.id
                            ? 'bg-blue-50 border border-blue-200'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelectDataset(dataset.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium truncate ${
                              activeDatasetId === dataset.id ? 'text-blue-900' : 'text-gray-900'
                            }`}>
                              {dataset.name}
                            </p>
                            {dataset.source === 'form' && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                Form
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            {dataset.records.length} records
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200">
                <button
                  onClick={() => { setShowImport(true); setShowSidebar(false); }}
                  className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Import Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeDataset ? (
            <LineListing
              dataset={activeDataset}
              onUpdateRecord={(recordId, updates) => updateRecord(activeDataset.id, recordId, updates)}
              onDeleteRecord={(recordId) => deleteRecord(activeDataset.id, recordId)}
              onAddRecord={(record) => addRecord(activeDataset.id, record)}
              onEditComplete={addEditLogEntry}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="mt-4 text-lg">Select a dataset to review records</p>
                <button
                  onClick={() => setShowImport(true)}
                  className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Import Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Log Panel */}
      {activeDataset && (
        <EditLogPanel
          entries={currentEditLog}
          isOpen={showEditLog}
          onToggle={() => setShowEditLog(!showEditLog)}
          onUpdateEntry={updateEditLogEntry}
          onExport={() => exportEditLog(activeDataset.id)}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <DataImport
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
