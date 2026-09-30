import React, { useState } from 'react';
import type { Dataset } from '../types/analysis';
import { isSampleDataset } from '../data/demoData';
import { Dialog } from './shared';

interface DashboardProps {
  datasets: Dataset[];
  onNavigate: (module: string) => void;
  onLoadDemo: () => void;
  onImportData: () => void;
  onOpenHelp: () => void;
  onSelectDataset: (datasetId: string) => void;
  onDeleteDataset: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  datasets,
  onNavigate,
  onLoadDemo,
  onImportData,
  onOpenHelp,
  onSelectDataset,
  onDeleteDataset,
}) => {
  const [deleteConfirmDataset, setDeleteConfirmDataset] = useState<Dataset | null>(null);

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

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">LineList</h1>
          {/* Scope covers routine analysis as well as outbreaks: the same tools
              summarize surveillance extracts and survey data. */}
          <p className="mt-2 text-gray-600 max-w-2xl">
            Clean, analyze, and map line lists, surveillance extracts, and survey data.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-10">
          <button
            onClick={onImportData}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Import data
          </button>
          {datasets.length === 0 && (
            <button
              onClick={handleLoadDemoAndNavigate}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Try a sample dataset
            </button>
          )}
          <button
            onClick={onOpenHelp}
            className="text-sm text-blue-700 hover:text-blue-900 underline underline-offset-2"
          >
            Tutorials and guides
          </button>
        </div>

        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Datasets
            </h2>
            {datasets.length > 0 && (
              <span className="text-sm text-gray-500">
                {datasets.length} dataset{datasets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {recentDatasets.length > 0 ? (
            <ul className="border border-gray-200 rounded-md divide-y divide-gray-200">
              {recentDatasets.map((dataset) => (
                <li key={dataset.id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                  <button
                    onClick={() => handleDatasetClick(dataset)}
                    className="flex-1 flex items-baseline justify-between gap-4 text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900 truncate">
                        {dataset.name}
                        {isSampleDataset(dataset.id) && (
                          <span className="ml-2 align-middle text-xs font-normal text-gray-600 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                            Sample
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-gray-500">
                        {dataset.records.length} record{dataset.records.length !== 1 ? 's' : ''}
                        {' · '}
                        {dataset.columns.length} variable{dataset.columns.length !== 1 ? 's' : ''}
                      </span>
                    </span>
                    <span className="text-sm text-gray-400 flex-shrink-0">
                      {formatDate(dataset.updatedAt)}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmDataset(dataset);
                    }}
                    className="p-2 text-gray-400 hover:text-red-700 rounded focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 flex-shrink-0"
                    title={`Delete ${dataset.name}`}
                    aria-label={`Delete ${dataset.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-600 border border-gray-200 rounded-md px-4 py-6">
              No datasets yet. Import a CSV or Excel file, or open a sample dataset to look around.
            </p>
          )}
        </section>

        {/* Orientation is for a first run only; afterwards the navigation above
            is the faster route and this is just something to scroll past. */}
        {datasets.length === 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
              How it works
            </h2>
            <ol className="text-gray-700 space-y-2 list-decimal list-inside">
              <li>Import a CSV or Excel file, or paste straight from a spreadsheet.</li>
              <li>Review and clean: duplicates, date consistency, ranges, and completeness.</li>
              <li>Analyze: epi curves, frequencies, cross-tabulations, and 2&times;2 tables.</li>
              <li>Map and chart the result, then export figures for a report.</li>
            </ol>
          </section>
        )}

        <section className="border-t border-gray-200 pt-6 text-sm text-gray-600 space-y-2">
          <p>
            Datasets and edits are saved in this browser only. Closing the tab is safe; your
            work will be here when you return. Nothing is uploaded to a server.
          </p>
          <p>
            To move work to another computer or keep a backup, use <strong>Save Project</strong> in
            the toolbar, and <strong>Load Project</strong> to restore it. A project file carries
            your datasets, edit history, and the analysis you have set up.
          </p>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmDataset && (
        <Dialog
          onClose={() => setDeleteConfirmDataset(null)}
          labelledBy="delete-dataset-title"
          className="max-w-md p-6"
        >
            <h3 id="delete-dataset-title" className="text-lg font-semibold text-gray-900 mb-2">Delete Dataset?</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "<span className="font-medium">{deleteConfirmDataset.name}</span>"?
              This will permanently remove {deleteConfirmDataset.records.length} record{deleteConfirmDataset.records.length !== 1 ? 's' : ''} and all associated edit history. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmDataset(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteDataset(deleteConfirmDataset.id);
                  setDeleteConfirmDataset(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};
