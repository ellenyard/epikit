import { useState, useMemo, useCallback } from 'react';
import type { FormItem, FormDefinition } from './types/form';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry } from './types/analysis';
import { FormBuilder } from './components/FormBuilder';
import { FormPreview } from './components/FormPreview';
import { ExportModal } from './components/ExportModal';
import { Review } from './components/review/Review';
import { Collect } from './components/collect/Collect';
import { EpiCurve } from './components/analysis/EpiCurve';
import { SpotMap } from './components/analysis/SpotMap';
import { DescriptiveTables } from './components/analysis/DescriptiveTables';
import { TwoByTwoAnalysis } from './components/analysis/TwoByTwoAnalysis';
import { DataImport } from './components/analysis/DataImport';
import { OnboardingWizard } from './components/OnboardingWizard';
import { HelpCenter } from './components/HelpCenter';
import { HelpIcon } from './components/HelpIcon';
import { AccessibilitySettings } from './components/AccessibilitySettings';
import { Dashboard } from './components/Dashboard';
import { demoFormItems, demoColumns, demoCaseRecords } from './data/demoData';
import { formToColumns, formDataToRecord, generateDatasetName } from './utils/formToDataset';
import { exportToCSV } from './utils/csvParser';

type Module = 'dashboard' | 'forms' | 'collect' | 'review' | 'epicurve' | 'spotmap' | 'descriptive-tables' | '2way';
type FormView = 'builder' | 'preview';

// Create demo dataset
const DEMO_DATASET_ID = 'demo-outbreak-2024';
const createDemoDataset = (): Dataset => ({
  id: DEMO_DATASET_ID,
  name: 'Foodborne Outbreak Investigation - Submissions',
  source: 'form',
  columns: demoColumns,
  records: demoCaseRecords,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Create demo form definition
const DEMO_FORM_ID = 'demo-foodborne-form';
const createDemoFormDefinition = (): FormDefinition => ({
  id: DEMO_FORM_ID,
  name: 'Foodborne Outbreak Investigation',
  description: 'Investigation form for suspected foodborne illness cases',
  fields: demoFormItems,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function App() {
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [formView, setFormView] = useState<FormView>('builder');
  const [previewItems, setPreviewItems] = useState<FormItem[]>([]);
  const [exportItems, setExportItems] = useState<FormItem[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);

  // Form definitions state (saved forms available for data collection)
  const [formDefinitions, setFormDefinitions] = useState<FormDefinition[]>(() => [createDemoFormDefinition()]);

  // Current form being edited in the builder
  const [currentFormId, setCurrentFormId] = useState<string | null>(DEMO_FORM_ID);
  const [currentFormName] = useState('Foodborne Outbreak Investigation');

  // Dataset state (shared between Collect and Analysis)
  const [datasets, setDatasets] = useState<Dataset[]>(() => [createDemoDataset()]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(DEMO_DATASET_ID);

  // Onboarding wizard can be accessed from Help Center
  // Dashboard now serves as the welcoming landing page

  // Get current form items for the builder
  const currentFormItems = useMemo(() => {
    if (currentFormId) {
      const form = formDefinitions.find(f => f.id === currentFormId);
      return form?.fields || demoFormItems;
    }
    return demoFormItems;
  }, [currentFormId, formDefinitions]);

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

  // Save form definition
  const handleSaveForm = useCallback((items: FormItem[], formName: string) => {
    const now = new Date().toISOString();

    if (currentFormId) {
      // Update existing form
      setFormDefinitions(prev => prev.map(f =>
        f.id === currentFormId
          ? { ...f, name: formName, fields: items, updatedAt: now }
          : f
      ));
    } else {
      // Create new form
      const newForm: FormDefinition = {
        id: crypto.randomUUID(),
        name: formName,
        fields: items,
        createdAt: now,
        updatedAt: now,
      };
      setFormDefinitions(prev => [...prev, newForm]);
      setCurrentFormId(newForm.id);
    }
  }, [currentFormId]);

  // Handle form submission from Collect module
  const handleFormSubmit = useCallback((formId: string, data: Record<string, unknown>) => {
    const form = formDefinitions.find(f => f.id === formId);
    if (!form) return;

    const datasetName = generateDatasetName(form.name);
    const existingDataset = datasets.find(d => d.name === datasetName && d.source === 'form');

    if (existingDataset) {
      // Add record to existing dataset
      const newRecord: CaseRecord = {
        id: crypto.randomUUID(),
        ...formDataToRecord(data, form.fields),
      };
      setDatasets(prev => prev.map(d =>
        d.id === existingDataset.id
          ? { ...d, records: [...d.records, newRecord], updatedAt: new Date().toISOString() }
          : d
      ));
    } else {
      // Create new dataset
      const columns = formToColumns(form.fields);
      const newRecord: CaseRecord = {
        id: crypto.randomUUID(),
        ...formDataToRecord(data, form.fields),
      };
      const newDataset: Dataset = {
        id: crypto.randomUUID(),
        name: datasetName,
        source: 'form',
        columns,
        records: [newRecord],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDatasets(prev => [...prev, newDataset]);
    }
  }, [formDefinitions, datasets]);

  // Dataset management functions for Analysis module
  const createDataset = useCallback((name: string, columns: DataColumn[], records: CaseRecord[], source: 'import' | 'form' = 'import') => {
    const newDataset: Dataset = {
      id: crypto.randomUUID(),
      name,
      source,
      columns,
      records,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setDatasets(prev => [...prev, newDataset]);
    setActiveDatasetId(newDataset.id);
    return newDataset;
  }, []);

  const updateDataset = useCallback((id: string, updates: Partial<Dataset>) => {
    setDatasets(prev => prev.map(d =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    ));
  }, []);

  const deleteDataset = useCallback((id: string) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (activeDatasetId === id) {
      setActiveDatasetId(null);
    }
  }, [activeDatasetId]);

  const addRecord = useCallback((datasetId: string, record: Omit<CaseRecord, 'id'>) => {
    const newRecord: CaseRecord = { ...record, id: crypto.randomUUID() };
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? { ...d, records: [...d.records, newRecord], updatedAt: new Date().toISOString() }
        : d
    ));
    return newRecord;
  }, []);

  const updateRecord = useCallback((datasetId: string, recordId: string, updates: Partial<CaseRecord>) => {
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? {
            ...d,
            records: d.records.map(r => r.id === recordId ? { ...r, ...updates } : r),
            updatedAt: new Date().toISOString()
          }
        : d
    ));
  }, []);

  const deleteRecord = useCallback((datasetId: string, recordId: string) => {
    setDatasets(prev => prev.map(d =>
      d.id === datasetId
        ? { ...d, records: d.records.filter(r => r.id !== recordId), updatedAt: new Date().toISOString() }
        : d
    ));
  }, []);

  // Edit log state and functions
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);

  const addEditLogEntry = useCallback((entry: EditLogEntry) => {
    setEditLog(prev => [...prev, entry]);
  }, []);

  const updateEditLogEntry = useCallback((id: string, updates: Partial<EditLogEntry>) => {
    setEditLog(prev => prev.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  }, []);

  const getEditLogForDataset = useCallback((datasetId: string) => {
    return editLog.filter(entry => entry.datasetId === datasetId);
  }, [editLog]);

  const exportEditLog = useCallback((datasetId: string) => {
    const entries = editLog.filter(e => e.datasetId === datasetId);
    if (entries.length === 0) return;

    const headers = ['Record ID', 'Variable', 'Old Value', 'New Value', 'Reason', 'Date/Time', 'Initials'];
    const rows = entries.map(e => [
      e.recordIdentifier,
      e.columnLabel,
      String(e.oldValue ?? ''),
      String(e.newValue ?? ''),
      e.reason,
      new Date(e.timestamp).toLocaleString(),
      e.initials,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dataset = datasets.find(d => d.id === datasetId);
    a.download = `${dataset?.name || 'dataset'}_edit_log.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [editLog, datasets]);

  // Get submission count for a form
  const getFormSubmissionCount = useCallback((formId: string) => {
    const form = formDefinitions.find(f => f.id === formId);
    if (!form) return 0;
    const datasetName = generateDatasetName(form.name);
    const dataset = datasets.find(d => d.name === datasetName && d.source === 'form');
    return dataset?.records.length || 0;
  }, [formDefinitions, datasets]);

  // Handle data import
  const handleImport = useCallback((name: string, columns: DataColumn[], records: CaseRecord[]) => {
    createDataset(name, columns, records, 'import');
    setShowImport(false);
  }, [createDataset]);

  // Get active dataset
  const activeDataset = datasets.find(d => d.id === activeDatasetId) || null;

  // Handle data export
  const handleDatasetExport = useCallback(() => {
    if (!activeDataset) return;
    const csv = exportToCSV(activeDataset.columns, activeDataset.records);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDataset.name}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeDataset]);

  // Handle onboarding demo load
  const handleLoadDemo = useCallback(() => {
    // Demo dataset is already loaded, just ensure it's selected
    setActiveDatasetId(DEMO_DATASET_ID);
  }, []);

  // Handle navigation from onboarding/help
  const handleNavigateToModule = useCallback((module: string) => {
    setActiveModule(module as Module);
  }, []);

  // Check if current module needs dataset selector
  const showDatasetSelector = ['review', 'epicurve', 'spotmap', 'descriptive-tables', '2way'].includes(activeModule);

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-slate-800 text-white px-3 sm:px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setActiveModule('dashboard')}
              className="text-lg sm:text-xl font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              EpiKit
            </button>
            <div className="flex gap-0.5 overflow-x-auto">
              <button
                onClick={() => setActiveModule('dashboard')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'dashboard'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => { setActiveModule('forms'); setFormView('builder'); }}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'forms'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Forms
              </button>
              <button
                onClick={() => setActiveModule('collect')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'collect'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Collect
              </button>
              <button
                onClick={() => setActiveModule('review')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'review'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Review/Clean
              </button>
              <span className="hidden sm:block w-px bg-slate-600 mx-1" />
              <button
                onClick={() => setActiveModule('epicurve')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'epicurve'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Epi Curve
              </button>
              <button
                onClick={() => setActiveModule('spotmap')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'spotmap'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Spot Map
              </button>
              <button
                onClick={() => setActiveModule('descriptive-tables')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'descriptive-tables'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Descriptive Tables
              </button>
              <button
                onClick={() => setActiveModule('2way')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === '2way'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                2x2 Tables
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAccessibilitySettings(true)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Accessibility Settings"
              title="Accessibility Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowHelpCenter(true)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Help & Tutorials"
              title="Help & Tutorials"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <div className="text-sm text-slate-400 hidden lg:block">
              Epidemiology Toolkit
            </div>
          </div>
        </div>
      </nav>

      {/* Dataset selector bar */}
      {showDatasetSelector && (
        <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Dataset:</label>
            <select
              value={activeDatasetId || ''}
              onChange={(e) => setActiveDatasetId(e.target.value || null)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white min-w-[200px]"
            >
              <option value="">Select a dataset...</option>
              {datasets.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.records.length} records)
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Import Data
            </button>
            <HelpIcon
              tooltip="Click for help with importing data"
              onClick={() => {
                setShowHelpCenter(true);
                // Note: We could enhance HelpCenter to accept a default section prop
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeModule === 'dashboard' ? (
          <Dashboard
            datasets={datasets}
            onNavigate={handleNavigateToModule}
            onLoadDemo={handleLoadDemo}
            onImportData={() => setShowImport(true)}
            onOpenHelp={() => setShowHelpCenter(true)}
            onSelectDataset={(id) => setActiveDatasetId(id)}
          />
        ) : activeModule === 'forms' ? (
          formView === 'builder' ? (
            <FormBuilder
              onPreview={handlePreview}
              onExport={handleExport}
              onSave={handleSaveForm}
              initialItems={currentFormItems}
              initialFormName={currentFormName}
            />
          ) : (
            <FormPreview items={previewItems} onBack={handleBackToBuilder} />
          )
        ) : activeModule === 'collect' ? (
          <Collect
            formDefinitions={formDefinitions}
            onSubmit={handleFormSubmit}
            getSubmissionCount={getFormSubmissionCount}
            onViewInAnalysis={(formId) => {
              const form = formDefinitions.find(f => f.id === formId);
              if (form) {
                const datasetName = generateDatasetName(form.name);
                const dataset = datasets.find(d => d.name === datasetName);
                if (dataset) {
                  setActiveDatasetId(dataset.id);
                }
              }
              setActiveModule('review');
            }}
          />
        ) : activeDataset ? (
          // Modules that require a dataset
          activeModule === 'review' ? (
            <Review
              datasets={datasets}
              activeDatasetId={activeDatasetId}
              setActiveDatasetId={setActiveDatasetId}
              createDataset={createDataset}
              updateDataset={updateDataset}
              deleteDataset={deleteDataset}
              addRecord={addRecord}
              updateRecord={updateRecord}
              deleteRecord={deleteRecord}
              addEditLogEntry={addEditLogEntry}
              updateEditLogEntry={updateEditLogEntry}
              getEditLogForDataset={getEditLogForDataset}
              exportEditLog={exportEditLog}
            />
          ) : activeModule === 'epicurve' ? (
            <EpiCurve dataset={activeDataset} onExportDataset={handleDatasetExport} />
          ) : activeModule === 'spotmap' ? (
            <SpotMap dataset={activeDataset} />
          ) : activeModule === 'descriptive-tables' ? (
            <DescriptiveTables dataset={activeDataset} onNavigateTo2x2={() => setActiveModule('2way')} onExportDataset={handleDatasetExport} />
          ) : activeModule === '2way' ? (
            <TwoByTwoAnalysis dataset={activeDataset} />
          ) : null
        ) : (
          // No dataset selected - show prompt
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center p-8">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg text-gray-500">Select a dataset to begin</p>
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

      {/* Export Modal */}
      {exportItems && (
        <ExportModal
          items={exportItems}
          formName={currentFormName}
          onClose={() => setExportItems(null)}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <DataImport
          onImport={handleImport}
          onCancel={() => setShowImport(false)}
        />
      )}

      {/* Onboarding Wizard */}
      <OnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onLoadDemo={handleLoadDemo}
        onNavigate={handleNavigateToModule}
      />

      {/* Help Center */}
      <HelpCenter
        isOpen={showHelpCenter}
        onClose={() => setShowHelpCenter(false)}
        onOpenOnboarding={() => {
          setShowHelpCenter(false);
          setShowOnboarding(true);
        }}
      />

      {/* Accessibility Settings */}
      <AccessibilitySettings
        isOpen={showAccessibilitySettings}
        onClose={() => setShowAccessibilitySettings(false)}
      />
    </div>
  );
}

export default App;
