import { useState } from 'react';
import { useDataset } from '../../hooks/useDataset';
import { DataImport } from './DataImport';
import { LineListing } from './LineListing';
import { TwoByTwoAnalysis } from './TwoByTwoAnalysis';
import { DescriptiveStats } from './DescriptiveStats';
import { EpiCurve } from './EpiCurve';
import { SpotMap } from './SpotMap';
import type { DataColumn, CaseRecord } from '../../types/analysis';

type AnalysisTab = 'linelist' | 'epicurve' | 'spotmap' | '2x2' | 'descriptive';

export function Analysis() {
  const {
    datasets,
    activeDataset,
    activeDatasetId,
    setActiveDatasetId,
    createDataset,
    deleteDataset,
    addRecord,
    updateRecord,
    deleteRecord,
  } = useDataset();

  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('linelist');

  const handleImport = (name: string, columns: DataColumn[], records: CaseRecord[]) => {
    createDataset(name, columns, records, 'import');
    setShowImport(false);
  };

  const tabs: { id: AnalysisTab; label: string; icon: string }[] = [
    { id: 'linelist', label: 'Line Listing', icon: '☰' },
    { id: 'epicurve', label: 'Epi Curve', icon: '📈' },
    { id: 'spotmap', label: 'Spot Map', icon: '📍' },
    { id: '2x2', label: '2x2 Table', icon: '⊞' },
    { id: 'descriptive', label: 'Descriptive', icon: '📊' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-100">

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Dataset Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
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
                      <p className={`text-sm font-medium truncate ${
                        activeDatasetId === dataset.id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {dataset.name}
                      </p>
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

          {/* Sample Data Button */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={() => {
                const sampleColumns: DataColumn[] = [
                  { key: 'case_id', label: 'Case ID', type: 'text' },
                  { key: 'onset_date', label: 'Onset Date', type: 'date' },
                  { key: 'age', label: 'Age', type: 'number' },
                  { key: 'sex', label: 'Sex', type: 'text' },
                  { key: 'exposure', label: 'Exposure', type: 'text' },
                  { key: 'outcome', label: 'Outcome', type: 'text' },
                  { key: 'latitude', label: 'Latitude', type: 'number' },
                  { key: 'longitude', label: 'Longitude', type: 'number' },
                ];
                const sampleRecords: CaseRecord[] = [
                  { id: '1', case_id: 'C001', onset_date: '2024-01-15', age: 34, sex: 'Female', exposure: 'Food', outcome: 'Recovered', latitude: 33.749, longitude: -84.388 },
                  { id: '2', case_id: 'C002', onset_date: '2024-01-16', age: 28, sex: 'Male', exposure: 'Food', outcome: 'Recovered', latitude: 33.755, longitude: -84.390 },
                  { id: '3', case_id: 'C003', onset_date: '2024-01-16', age: 45, sex: 'Female', exposure: 'Water', outcome: 'Hospitalized', latitude: 33.762, longitude: -84.385 },
                  { id: '4', case_id: 'C004', onset_date: '2024-01-17', age: 52, sex: 'Male', exposure: 'Food', outcome: 'Recovered', latitude: 33.744, longitude: -84.395 },
                  { id: '5', case_id: 'C005', onset_date: '2024-01-17', age: 31, sex: 'Female', exposure: 'Unknown', outcome: 'Recovered', latitude: 33.758, longitude: -84.378 },
                  { id: '6', case_id: 'C006', onset_date: '2024-01-18', age: 67, sex: 'Male', exposure: 'Food', outcome: 'Hospitalized', latitude: 33.740, longitude: -84.382 },
                  { id: '7', case_id: 'C007', onset_date: '2024-01-18', age: 23, sex: 'Female', exposure: 'Food', outcome: 'Recovered', latitude: 33.768, longitude: -84.392 },
                  { id: '8', case_id: 'C008', onset_date: '2024-01-19', age: 41, sex: 'Male', exposure: 'Water', outcome: 'Recovered', latitude: 33.752, longitude: -84.372 },
                ];
                createDataset('Sample Outbreak Data', sampleColumns, sampleRecords, 'import');
              }}
              className="w-full px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Load Sample Data
            </button>
          </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeDataset ? (
            <>
              {/* Tab Navigation */}
              <div className="bg-white border-b border-gray-200 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab.id
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span className="mr-2">{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-sm text-gray-500">
                    {activeDataset.name} &bull; {activeDataset.records.length} records
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto bg-white">
                {activeTab === 'linelist' && (
                  <LineListing
                    dataset={activeDataset}
                    onUpdateRecord={(recordId, updates) => updateRecord(activeDataset.id, recordId, updates)}
                    onDeleteRecord={(recordId) => deleteRecord(activeDataset.id, recordId)}
                    onAddRecord={(record) => addRecord(activeDataset.id, record)}
                  />
                )}
                {activeTab === 'epicurve' && (
                  <EpiCurve dataset={activeDataset} />
                )}
                {activeTab === 'spotmap' && (
                  <SpotMap dataset={activeDataset} />
                )}
                {activeTab === '2x2' && (
                  <TwoByTwoAnalysis dataset={activeDataset} />
                )}
                {activeTab === 'descriptive' && (
                  <DescriptiveStats dataset={activeDataset} />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-4 text-lg">Select a dataset or import data</p>
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
