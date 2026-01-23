import { useState, useRef } from 'react';
import { parseCSV } from '../../utils/csvParser';
import type { DataColumn, CaseRecord } from '../../types/analysis';
import { useLocale } from '../../contexts/LocaleContext';

interface DataImportProps {
  onImport: (name: string, columns: DataColumn[], records: CaseRecord[]) => void;
  onCancel: () => void;
}

export function DataImport({ onImport, onCancel }: DataImportProps) {
  const { config: localeConfig } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    columns: DataColumn[];
    records: CaseRecord[];
    errors: string[];
  } | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setDatasetName(selectedFile.name.replace(/\.[^/.]+$/, ''));
    setIsLoading(true);

    try {
      const content = await selectedFile.text();
      const result = parseCSV(content, { localeConfig });
      setPreview(result);
    } catch {
      setPreview({ columns: [], records: [], errors: ['Failed to read file'] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview || preview.records.length === 0) return;
    onImport(datasetName || 'Untitled Dataset', preview.columns, preview.records);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Import Data</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mt-4 text-lg font-medium text-gray-900">
                Click to upload a CSV file
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Or drag and drop your file here
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Parsing file...</span>
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Dataset Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dataset Name
                </label>
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Parse Errors */}
              {preview.errors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-yellow-800 mb-1">
                    Warnings ({preview.errors.length})
                  </h4>
                  <ul className="text-sm text-yellow-700 list-disc list-inside">
                    {preview.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {preview.errors.length > 5 && (
                      <li>...and {preview.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{preview.records.length}</p>
                    <p className="text-sm text-gray-500">Records</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{preview.columns.length}</p>
                    <p className="text-sm text-gray-500">Columns</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500">Source File</p>
                  </div>
                </div>
              </div>

              {/* Column Preview */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Detected Columns</h4>
                <div className="flex flex-wrap gap-2">
                  {preview.columns.map((col) => (
                    <span
                      key={col.key}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
                    >
                      {col.label}
                      <span className="ml-1 text-xs text-gray-500">({col.type})</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Data Preview */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  Data Preview (first 5 rows)
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-auto max-h-64">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {preview.columns.map((col) => (
                          <th
                            key={col.key}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {preview.records.slice(0, 5).map((record) => (
                        <tr key={record.id}>
                          {preview.columns.map((col) => (
                            <td
                              key={col.key}
                              className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap"
                            >
                              {String(record[col.key] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Change File */}
              <button
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Choose a different file
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || preview.records.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {preview?.records.length || 0} Records
          </button>
        </div>
      </div>
    </div>
  );
}
