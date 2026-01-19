import { useState, useMemo, useCallback } from 'react';
import type { FormItem, FormDefinition } from './types/form';
import type { Dataset, DataColumn, CaseRecord } from './types/analysis';
import { FormBuilder } from './components/FormBuilder';
import { FormPreview } from './components/FormPreview';
import { ExportModal } from './components/ExportModal';
import { Analysis } from './components/analysis/Analysis';
import { Collect } from './components/collect/Collect';
import { demoFormItems, demoColumns, demoCaseRecords, demoDatasetName } from './data/demoData';
import { formToColumns, formDataToRecord, generateDatasetName } from './utils/formToDataset';

type Module = 'forms' | 'collect' | 'analysis';
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
  const [activeModule, setActiveModule] = useState<Module>('forms');
  const [formView, setFormView] = useState<FormView>('builder');
  const [previewItems, setPreviewItems] = useState<FormItem[]>([]);
  const [exportItems, setExportItems] = useState<FormItem[] | null>(null);

  // Form definitions state (saved forms available for data collection)
  const [formDefinitions, setFormDefinitions] = useState<FormDefinition[]>(() => [createDemoFormDefinition()]);

  // Current form being edited in the builder
  const [currentFormId, setCurrentFormId] = useState<string | null>(DEMO_FORM_ID);
  const [currentFormName] = useState('Foodborne Outbreak Investigation');

  // Dataset state (shared between Collect and Analysis)
  const [datasets, setDatasets] = useState<Dataset[]>(() => [createDemoDataset()]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(DEMO_DATASET_ID);

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

  // Get submission count for a form
  const getFormSubmissionCount = useCallback((formId: string) => {
    const form = formDefinitions.find(f => f.id === formId);
    if (!form) return 0;
    const datasetName = generateDatasetName(form.name);
    const dataset = datasets.find(d => d.name === datasetName && d.source === 'form');
    return dataset?.records.length || 0;
  }, [formDefinitions, datasets]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-slate-800 text-white px-3 sm:px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-6">
            <span className="text-lg sm:text-xl font-bold text-blue-400">EpiKit</span>
            <div className="flex gap-1">
              <button
                onClick={() => { setActiveModule('forms'); setFormView('builder'); }}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeModule === 'forms'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Forms
              </button>
              <button
                onClick={() => setActiveModule('collect')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeModule === 'collect'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Collect
              </button>
              <button
                onClick={() => setActiveModule('analysis')}
                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeModule === 'analysis'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Analysis
              </button>
            </div>
          </div>
          <div className="text-sm text-slate-400 hidden sm:block">
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
              setActiveModule('analysis');
            }}
          />
        ) : (
          <Analysis
            datasets={datasets}
            activeDatasetId={activeDatasetId}
            setActiveDatasetId={setActiveDatasetId}
            createDataset={createDataset}
            deleteDataset={deleteDataset}
            addRecord={addRecord}
            updateRecord={updateRecord}
            deleteRecord={deleteRecord}
          />
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
    </div>
  );
}

export default App;
