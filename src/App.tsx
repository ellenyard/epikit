import { useState } from 'react';
import type { FormField } from './types/form';
import { FormBuilder } from './components/FormBuilder';
import { FormPreview } from './components/FormPreview';
import { ExportModal } from './components/ExportModal';
import { Analysis } from './components/analysis/Analysis';

type Module = 'forms' | 'analysis';
type FormView = 'builder' | 'preview';

function App() {
  const [activeModule, setActiveModule] = useState<Module>('forms');
  const [formView, setFormView] = useState<FormView>('builder');
  const [previewFields, setPreviewFields] = useState<FormField[]>([]);
  const [exportFields, setExportFields] = useState<FormField[] | null>(null);

  const handlePreview = (fields: FormField[]) => {
    setPreviewFields(fields);
    setFormView('preview');
  };

  const handleExport = (fields: FormField[]) => {
    setExportFields(fields);
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
            <FormBuilder onPreview={handlePreview} onExport={handleExport} />
          ) : (
            <FormPreview fields={previewFields} onBack={handleBackToBuilder} />
          )
        ) : (
          <Analysis />
        )}
      </div>

      {/* Export Modal */}
      {exportFields && (
        <ExportModal
          fields={exportFields}
          formName="Untitled Form"
          onClose={() => setExportFields(null)}
        />
      )}
    </div>
  );
}

export default App;
