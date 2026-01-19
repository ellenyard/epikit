import { useState, useMemo } from 'react';
import type { FormItem } from './types/form';
import type { Dataset } from './types/analysis';
import { FormBuilder } from './components/FormBuilder';
import { FormPreview } from './components/FormPreview';
import { ExportModal } from './components/ExportModal';
import { Analysis } from './components/analysis/Analysis';
import { demoFormItems, demoColumns, demoCaseRecords, demoDatasetName } from './data/demoData';

type Module = 'forms' | 'analysis';
type FormView = 'builder' | 'preview';

// Create demo dataset
const DEMO_DATASET_ID = 'demo-outbreak-2024';
const createDemoDataset = (): Dataset => ({
  id: DEMO_DATASET_ID,
  name: demoDatasetName,
  source: 'import',
  columns: demoColumns,
  records: demoCaseRecords,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function App() {
  const [activeModule, setActiveModule] = useState<Module>('forms');
  const [formView, setFormView] = useState<FormView>('builder');
  const [previewItems, setPreviewItems] = useState<FormItem[]>([]);
  const [exportItems, setExportItems] = useState<FormItem[] | null>(null);

  // Initialize demo dataset
  const demoDatasets = useMemo(() => [createDemoDataset()], []);

  const handlePreview = (items: FormItem[]) => {
    setPreviewItems(items);
    setFormView('preview');
  };

  const handleExport = (items: FormItem[]) => {
    setExportItems(items);
  };

  const handleBackToBuilder = () => {
    setFormView('builder');
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-slate-800 text-white px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xl font-bold text-blue-400">EpiKit</span>
            <div className="flex gap-1">
              <button
                onClick={() => { setActiveModule('forms'); setFormView('builder'); }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeModule === 'forms'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Forms
              </button>
              <button
                onClick={() => setActiveModule('analysis')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeModule === 'analysis'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Analysis
              </button>
            </div>
          </div>
          <div className="text-sm text-slate-400">
            Epidemiology Toolkit
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeModule === 'forms' ? (
          formView === 'builder' ? (
            <FormBuilder
              onPreview={handlePreview}
              onExport={handleExport}
              initialItems={demoFormItems}
            />
          ) : (
            <FormPreview items={previewItems} onBack={handleBackToBuilder} />
          )
        ) : (
          <Analysis
            initialDatasets={demoDatasets}
            initialActiveId={DEMO_DATASET_ID}
          />
        )}
      </div>

      {/* Export Modal */}
      {exportItems && (
        <ExportModal
          items={exportItems}
          formName="Untitled Form"
          onClose={() => setExportItems(null)}
        />
      )}
    </div>
  );
}

export default App;
