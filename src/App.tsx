/**
 * EpiKit - Main Application Component
 *
 * This is the root component of EpiKit, an epidemiology toolkit designed for
 * FETP (Field Epidemiology Training Program) residents to analyze outbreak data.
 *
 * Application Structure:
 * - Dashboard: Landing page with quick actions and dataset overview
 * - Review/Clean: Data quality checks, editing, and variable creation
 * - Epi Curve: Epidemic curve visualization with stratification
 * - Spot Map: Geographic visualization using Leaflet/OpenStreetMap
 * - Analysis: Variable exploration, frequency tables, and 2x2 analysis
 *
 * Data Flow:
 * 1. Data can be imported via CSV/Excel in any analysis module
 * 2. All data persisted to localStorage and can be exported as project files
 *
 * State Management:
 * - Uses React useState/useCallback for local state
 * - Persists to localStorage on every change (auto-save)
 * - Edit log tracks all data modifications for audit trail
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry } from './types/analysis';
import { Review } from './components/review/Review';
import { EpiCurve } from './components/analysis/EpiCurve';
import { SpotMap } from './components/analysis/SpotMap';
import { AnalysisWorkflow } from './components/analysis/AnalysisWorkflow';
import { DataImport } from './components/analysis/DataImport';
import { OnboardingWizard } from './components/OnboardingWizard';
import { HelpCenter } from './components/HelpCenter';
import { HelpIcon } from './components/HelpIcon';
import { AccessibilitySettings } from './components/AccessibilitySettings';
import { LocaleSettings } from './components/LocaleSettings';
import { Dashboard } from './components/Dashboard';
import { VisualizeWorkflow } from './components/visualize/VisualizeWorkflow';
import { demoColumns, demoCaseRecords } from './data/demoData';
import { exportToCSV } from './utils/csvParser';
import { useLocale } from './contexts/LocaleContext';
import { addVariableToDataset } from './utils/variableCreation';
import { exportProject, downloadProject, parseProjectFile } from './utils/persistence';
import type { VariableConfig } from './types/analysis';

/** Available navigation modules in the app */
type Module = 'dashboard' | 'review' | 'epicurve' | 'spotmap' | 'analysis' | 'visualize';

// =============================================================================
// DEMO DATA SETUP
// These functions create the sample foodborne outbreak dataset that ships with
// the app. Users can explore features without importing their own data first.
// =============================================================================

const DEMO_DATASET_ID = 'demo-outbreak-2024';
// Bump this version whenever demo data in demoData.ts changes.
// Existing users with stale demo data will get the updated version automatically.
const DEMO_DATA_VERSION = 2;

/** Creates the demo dataset with sample outbreak investigation data */
const createDemoDataset = (): Dataset => ({
  id: DEMO_DATASET_ID,
  name: 'Foodborne Outbreak Investigation - Submissions',
  source: 'form',
  columns: demoColumns,
  records: demoCaseRecords,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// =============================================================================
// MAIN APPLICATION COMPONENT
// =============================================================================

function App() {
  // Locale settings for number formatting (decimal/thousand separators)
  const { config: localeConfig } = useLocale();

  // ---------------------------------------------------------------------------
  // UI STATE - Controls which module/modal is currently visible
  // ---------------------------------------------------------------------------
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [showImport, setShowImport] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const [showLocaleSettings, setShowLocaleSettings] = useState(false);
  const [showProjectLoadConfirm, setShowProjectLoadConfirm] = useState<{ project: ReturnType<typeof parseProjectFile>; filename: string } | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // DATASET STATE
  // Core data storage - shared across Review and Analysis modules.
  // Each dataset has columns (schema) and records (rows of data).
  // ---------------------------------------------------------------------------
  const [datasets, setDatasets] = useState<Dataset[]>(() => {
    const saved = localStorage.getItem('epikit_datasets');
    return saved ? JSON.parse(saved) : [createDemoDataset()];
  });

  // Which dataset is currently selected for viewing/editing
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => {
    const saved = localStorage.getItem('epikit_activeDatasetId');
    return saved || DEMO_DATASET_ID;
  });

  // Onboarding wizard can be accessed from Help Center
  // Dashboard now serves as the welcoming landing page

  // ---------------------------------------------------------------------------
  // DATASET CRUD OPERATIONS
  // These functions manage datasets and are passed to child components.
  // All changes trigger auto-save to localStorage via useEffect hooks.
  // ---------------------------------------------------------------------------

  /** Create a new dataset (from CSV import or form submissions) */
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

  /** Update dataset metadata or replace columns/records */
  const updateDataset = useCallback((id: string, updates: Partial<Dataset>) => {
    setDatasets(prev => prev.map(d =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    ));
  }, []);

  /** Delete a dataset and clear selection if it was active */
  const deleteDataset = useCallback((id: string) => {
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (activeDatasetId === id) {
      setActiveDatasetId(null);
    }
  }, [activeDatasetId]);

  /** Add a new record to a dataset (from form submission or manual entry) */
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

  // ---------------------------------------------------------------------------
  // EDIT LOG - AUDIT TRAIL
  // Tracks all data modifications for transparency and reproducibility.
  // Each entry records: what changed, old/new values, reason, and who made it.
  // ---------------------------------------------------------------------------
  const [editLog, setEditLog] = useState<EditLogEntry[]>(() => {
    const saved = localStorage.getItem('epikit_editLog');
    return saved ? JSON.parse(saved) : [];
  });

  // ---------------------------------------------------------------------------
  // DEMO DATA VERSION CHECK
  // Refresh the demo dataset if a newer version has been deployed.
  // Only replaces the demo dataset — user-created datasets are untouched.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const savedVersion = localStorage.getItem('epikit_demoDataVersion');
    if (!savedVersion || Number(savedVersion) < DEMO_DATA_VERSION) {
      setDatasets(prev => {
        const withoutOldDemo = prev.filter(d => d.id !== DEMO_DATASET_ID);
        return [createDemoDataset(), ...withoutOldDemo];
      });
      localStorage.setItem('epikit_demoDataVersion', String(DEMO_DATA_VERSION));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // AUTO-SAVE TO LOCALSTORAGE
  // All state changes are automatically persisted so users don't lose work.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem('epikit_datasets', JSON.stringify(datasets));
  }, [datasets]);

  useEffect(() => {
    localStorage.setItem('epikit_editLog', JSON.stringify(editLog));
  }, [editLog]);

  useEffect(() => {
    if (activeDatasetId) {
      localStorage.setItem('epikit_activeDatasetId', activeDatasetId);
    }
  }, [activeDatasetId]);

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
    const csv = exportToCSV(activeDataset.columns, activeDataset.records, { localeConfig });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDataset.name}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeDataset, localeConfig]);

  // Handle onboarding demo load
  const handleLoadDemo = useCallback(() => {
    // Demo dataset is already loaded, just ensure it's selected
    setActiveDatasetId(DEMO_DATASET_ID);
  }, []);

  // Handle navigation from onboarding/help
  const handleNavigateToModule = useCallback((module: string) => {
    setActiveModule(module as Module);
  }, []);

  // Handle variable creation from Analysis workflow
  const handleCreateVariable = useCallback((config: VariableConfig, values: unknown[]) => {
    if (!activeDataset) return;

    const updatedDataset = addVariableToDataset(activeDataset, config, values);
    updateDataset(activeDataset.id, {
      columns: updatedDataset.columns,
      records: updatedDataset.records,
    });

    // Add entry to edit log
    addEditLogEntry({
      id: crypto.randomUUID(),
      datasetId: activeDataset.id,
      recordId: 'system',
      recordIdentifier: 'System',
      columnKey: config.name,
      columnLabel: config.label,
      oldValue: null,
      newValue: `Created variable: ${config.label}`,
      reason: `New ${config.method} variable created from ${config.sourceColumn || 'scratch'}`,
      initials: 'SYS',
      timestamp: new Date().toISOString(),
    });
  }, [activeDataset, updateDataset, addEditLogEntry]);

  // Handle bulk record updates from Analysis workflow (for Fix Values)
  const handleUpdateRecords = useCallback((updates: Array<{ recordId: string; field: string; value: unknown }>) => {
    if (!activeDataset) return;

    // Group updates and apply them
    const updatedRecords = activeDataset.records.map(record => {
      const recordUpdates = updates.filter(u => u.recordId === record.id);
      if (recordUpdates.length === 0) return record;

      const newRecord = { ...record };
      recordUpdates.forEach(update => {
        newRecord[update.field] = update.value;
      });
      return newRecord;
    });

    updateDataset(activeDataset.id, { records: updatedRecords });

    // Log the bulk update
    const fieldName = updates[0]?.field;
    const column = activeDataset.columns.find(c => c.key === fieldName);
    addEditLogEntry({
      id: crypto.randomUUID(),
      datasetId: activeDataset.id,
      recordId: 'bulk',
      recordIdentifier: 'Bulk Update',
      columnKey: fieldName || '',
      columnLabel: column?.label || fieldName || '',
      oldValue: null,
      newValue: `${updates.length} records updated`,
      reason: 'Bulk value fix/recode from Variable Explorer',
      initials: 'SYS',
      timestamp: new Date().toISOString(),
    });
  }, [activeDataset, updateDataset, addEditLogEntry]);

  // ---------------------------------------------------------------------------
  // PROJECT SAVE/LOAD
  // Users can export entire project (datasets, edit log) as JSON file
  // and reload it later. Useful for sharing or backing up work.
  // ---------------------------------------------------------------------------

  /** Export all project data to a downloadable JSON file */
  const handleSaveProject = useCallback(() => {
    const project = exportProject(
      datasets,
      activeDatasetId,
      editLog
    );
    downloadProject(project);
  }, [datasets, activeDatasetId, editLog]);

  // Project load handler - show file picker
  const handleLoadProjectClick = useCallback(() => {
    projectFileInputRef.current?.click();
  }, []);

  // Project file selected
  const handleProjectFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const project = parseProjectFile(content);
      if (project) {
        setShowProjectLoadConfirm({ project, filename: file.name });
      } else {
        alert('Invalid project file. Please select a valid EpiKit project file.');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    e.target.value = '';
  }, []);

  // Confirm loading project
  const handleConfirmLoadProject = useCallback(() => {
    if (!showProjectLoadConfirm?.project) return;

    const project = showProjectLoadConfirm.project;

    // Load all project data
    setDatasets(project.datasets);
    setActiveDatasetId(project.activeDatasetId);
    setEditLog(project.editLog);

    // Restore analysis states to localStorage
    if (project.analysisState) {
      localStorage.setItem('epikit_analysis_state', JSON.stringify(project.analysisState));
    }

    setShowProjectLoadConfirm(null);
    setActiveModule('dashboard');
  }, [showProjectLoadConfirm]);

  // Check if current module needs dataset selector
  const showDatasetSelector = ['review', 'epicurve', 'spotmap', 'analysis', 'visualize'].includes(activeModule);

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
                onClick={() => setActiveModule('analysis')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'analysis'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Analysis
              </button>
              <button
                onClick={() => setActiveModule('visualize')}
                className={`px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeModule === 'visualize'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Visualize
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Hidden file input for project load */}
            <input
              ref={projectFileInputRef}
              type="file"
              accept=".json"
              onChange={handleProjectFileChange}
              className="hidden"
            />
            <button
              onClick={handleSaveProject}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Save Project"
              title="Save Project"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
            <button
              onClick={handleLoadProjectClick}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Load Project"
              title="Load Project"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>
            <span className="hidden sm:block w-px h-6 bg-slate-600 mx-1" />
            <button
              onClick={() => setShowLocaleSettings(true)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Language & Region Settings"
              title="Language & Region Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </button>
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
          ) : activeModule === 'analysis' ? (
            <AnalysisWorkflow
              dataset={activeDataset}
              onCreateVariable={handleCreateVariable}
              onUpdateRecords={handleUpdateRecords}
            />
          ) : activeModule === 'visualize' ? (
            <VisualizeWorkflow dataset={activeDataset} />
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

      {/* Locale Settings */}
      <LocaleSettings
        isOpen={showLocaleSettings}
        onClose={() => setShowLocaleSettings(false)}
      />

      {/* Project Load Confirmation Modal */}
      {showProjectLoadConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Load Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Loading <span className="font-medium">{showProjectLoadConfirm.filename}</span> will replace all current data including:
            </p>
            <ul className="text-sm text-gray-600 mb-4 space-y-1 ml-4">
              <li>• {showProjectLoadConfirm.project?.datasets.length || 0} dataset(s)</li>
              <li>• {showProjectLoadConfirm.project?.editLog.length || 0} edit log entries</li>
              <li>• All saved analysis settings</li>
            </ul>
            <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg mb-4">
              This action cannot be undone. Consider saving your current project first.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowProjectLoadConfirm(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLoadProject}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Load Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
