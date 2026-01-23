import React from 'react';
import type { Dataset } from '../types/analysis';

interface DashboardProps {
  datasets: Dataset[];
  onNavigate: (module: string) => void;
  onLoadDemo: () => void;
  onImportData: () => void;
  onOpenHelp: () => void;
  onSelectDataset: (datasetId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  datasets,
  onNavigate,
  onLoadDemo,
  onImportData,
  onOpenHelp,
  onSelectDataset,
}) => {
  // Get datasets sorted by most recent
  const recentDatasets = [...datasets].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ).slice(0, 5);

  const handleDatasetClick = (dataset: Dataset) => {
    onSelectDataset(dataset.id);
    onNavigate('review');
  };

  const handleLoadDemoAndNavigate = () => {
    onLoadDemo();
    onNavigate('review');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const [showSidebar, setShowSidebar] = React.useState(false);

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
          Menu
        </button>
        <span className="text-sm text-gray-500">EpiKit</span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Quick Actions
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-1">
              {/* Import Data */}
              <button
                onClick={onImportData}
                className="w-full p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Import Data</p>
                    <p className="text-xs text-gray-500">CSV or spreadsheet</p>
                  </div>
                </div>
              </button>

              {/* Create Form */}
              <button
                onClick={() => onNavigate('forms')}
                className="w-full p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Create Form</p>
                    <p className="text-xs text-gray-500">Build data collection form</p>
                  </div>
                </div>
              </button>

              {/* Try Demo */}
              <button
                onClick={handleLoadDemoAndNavigate}
                className="w-full p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Try Demo</p>
                    <p className="text-xs text-gray-500">Sample outbreak data</p>
                  </div>
                </div>
              </button>

              {/* Help */}
              <button
                onClick={onOpenHelp}
                className="w-full p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Help & Tutorials</p>
                    <p className="text-xs text-gray-500">Learn EpiKit</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent Datasets Section in Sidebar */}
          <div className="border-t border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Recent Datasets
            </h3>
            {recentDatasets.length > 0 ? (
              <div className="space-y-1">
                {recentDatasets.slice(0, 3).map((dataset) => (
                  <button
                    key={dataset.id}
                    onClick={() => handleDatasetClick(dataset)}
                    className="w-full p-2 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">{dataset.name}</p>
                    <p className="text-xs text-gray-500">
                      {dataset.records.length} records
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No datasets yet</p>
            )}
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setShowSidebar(false)}>
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Menu</h2>
                <button onClick={() => setShowSidebar(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                  {/* Same buttons as desktop */}
                  <button
                    onClick={() => { onImportData(); setShowSidebar(false); }}
                    className="w-full p-3 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Import Data</p>
                        <p className="text-xs text-gray-500">CSV or spreadsheet</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => { onNavigate('forms'); setShowSidebar(false); }}
                    className="w-full p-3 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Create Form</p>
                        <p className="text-xs text-gray-500">Build data collection form</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => { handleLoadDemoAndNavigate(); setShowSidebar(false); }}
                    className="w-full p-3 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Try Demo</p>
                        <p className="text-xs text-gray-500">Sample outbreak data</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => { onOpenHelp(); setShowSidebar(false); }}
                    className="w-full p-3 rounded-lg hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Help & Tutorials</p>
                        <p className="text-xs text-gray-500">Learn EpiKit</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="p-6 max-w-4xl">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">EpiKit</h1>
              <p className="text-gray-600">
                Outbreak investigation toolkit for collecting, cleaning, and analyzing epidemiological data
              </p>
            </div>

            {/* Recent Datasets Table */}
            {recentDatasets.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Datasets</h2>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Dataset
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Records
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Variables
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Updated
                        </th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentDatasets.map((dataset) => (
                        <tr key={dataset.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleDatasetClick(dataset)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded flex items-center justify-center ${
                                dataset.source === 'form' ? 'bg-green-100' : 'bg-blue-100'
                              }`}>
                                {dataset.source === 'form' ? (
                                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                )}
                              </div>
                              <span className="text-sm font-medium text-gray-900">{dataset.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {dataset.records.length}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {dataset.columns.length}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {formatDate(dataset.updatedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Information Sections */}
            <div className="space-y-4">
              {/* Data Persistence */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900 mb-1">Automatic Saving</h3>
                    <p className="text-sm text-blue-800">
                      All datasets, forms, and edits are saved automatically in your browser.
                      Data is stored locally only. Use export features to create backups or transfer to other devices.
                    </p>
                  </div>
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-green-900 mb-1">Data Privacy</h3>
                    <p className="text-sm text-green-800">
                      Your data stays in your browser. Nothing is uploaded to any server.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
