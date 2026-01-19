import { useState } from 'react';
import type { FormField, FormDefinition } from '../types/form';

interface ExportModalProps {
  fields: FormField[];
  formName: string;
  onClose: () => void;
}

export function ExportModal({ fields, formName, onClose }: ExportModalProps) {
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  const formDefinition: FormDefinition = {
    id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
    name: formName,
    fields,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const getExportContent = () => {
    if (exportFormat === 'json') {
      return JSON.stringify(formDefinition, null, 2);
    } else {
      // CSV export - create a template for data collection
      const headers = fields.map((f) => f.label).join(',');
      const fieldIds = fields.map((f) => f.id).join(',');
      return `# Form: ${formName}\n# Field IDs: ${fieldIds}\n${headers}\n`;
    }
  };

  const downloadFile = () => {
    const content = getExportContent();
    const blob = new Blob([content], {
      type: exportFormat === 'json' ? 'application/json' : 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formName.toLowerCase().replace(/\s+/g, '_')}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    const content = getExportContent();
    await navigator.clipboard.writeText(content);
    alert('Copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Export Form</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-gray-200">
          <div className="flex gap-2">
            <button
              onClick={() => setExportFormat('json')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'json'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              JSON (Form Definition)
            </button>
            <button
              onClick={() => setExportFormat('csv')}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${
                exportFormat === 'csv'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              CSV (Data Template)
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-auto">
            {getExportContent()}
          </pre>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            {exportFormat === 'json'
              ? 'This JSON file can be imported later to recreate the form.'
              : 'Use this CSV template for data collection.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Copy
            </button>
            <button
              onClick={downloadFile}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
