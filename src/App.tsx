/**
 * LineList - Main Application Component
 *
 * This is the root component of LineList, an epidemiology toolkit designed for
 * FETP (Field Epidemiology Training Program) residents to analyze outbreak data.
 *
 * Application Structure:
 * - Dashboard: Landing page with quick actions and dataset overview
 * - Review/Clean: Data quality checks, editing, and variable creation
 * - Epi Curve: Epidemic curve visualization with stratification
 * - Maps: Geographic visualization using Leaflet/OpenStreetMap
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
import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import type { Dataset, DataColumn, CaseRecord, EditLogEntry } from './types/analysis';
import { DataImport } from './components/analysis/DataImport';
import { OnboardingWizard } from './components/OnboardingWizard';
import { HelpCenter } from './components/HelpCenter';
import { HelpIcon } from './components/HelpIcon';
import { AccessibilitySettings } from './components/AccessibilitySettings';
import { LocaleSettings } from './components/LocaleSettings';
import { Dashboard } from './components/Dashboard';
import { Tutorial } from './components/Tutorial';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

// Heavy analysis modules are code-split so the initial load (Dashboard + shell)
// stays small. Maps pulls in Leaflet/markercluster and Visualize pulls in the
// full chart gallery; neither is needed until the user opens that module.
const Review = lazy(() => import('./components/review/Review').then((m) => ({ default: m.Review })));
const EpiCurve = lazy(() => import('./components/analysis/EpiCurve').then((m) => ({ default: m.EpiCurve })));
const Maps = lazy(() => import('./components/analysis/Maps').then((m) => ({ default: m.Maps })));
const AnalysisWorkflow = lazy(() => import('./components/analysis/AnalysisWorkflow').then((m) => ({ default: m.AnalysisWorkflow })));
const VisualizeWorkflow = lazy(() => import('./components/visualize/VisualizeWorkflow').then((m) => ({ default: m.VisualizeWorkflow })));
import { isSampleDataset } from './data/demoData';
import {
  OUTBREAK_SAMPLE_ID as DEMO_DATASET_ID,
  SURVEILLANCE_SAMPLE_ID as DEMO_SURVEILLANCE_DATASET_ID,
  SAMPLE_DATA_VERSION,
  createSampleDataset,
  prepareStartingDatasets,
} from './data/sampleDatasets';
import { exportToCSV } from './utils/csvParser';
import { useLocale } from './contexts/LocaleContext';
import { addVariableToDataset } from './utils/variableCreation';
import { exportProject, downloadProject, parseProjectFile, saveDatasets, saveEditLog, saveActiveDatasetId, restoreModuleState, sanitizeDataset, sanitizeEditLog, readStorage, writeStorage, removeStorage } from './utils/persistence';
import { FEEDBACK_EMAIL, FEEDBACK_MAILTO } from './utils/contact';
import type { VariableConfig } from './types/analysis';
import { Dialog } from './components/shared';
import { moduleFromPath, pathForModule, type AppModule } from './utils/appRoutes';

/** Available navigation modules in the app (each has its own address; see appRoutes.ts) */
type Module = AppModule;

// =============================================================================
// SAMPLE DATA
// The bundled samples (src/data/sampleDatasets.ts) load when someone opens one
// from the tutorial or a ?sample= link, not on a first visit.
// =============================================================================

interface InitialAppEntry {
  activeModule: Module;
  activeDatasetId?: string;
  showImport: boolean;
  showHelp: boolean;
  sampleOutbreak: boolean;
}

function getInitialAppEntry(): InitialAppEntry {
  const params = new URLSearchParams(window.location.search);

  const action = params.get('action');
  const sample = params.get('sample');

  if (sample === 'outbreak') {
    return {
      activeModule: 'epicurve',
      activeDatasetId: DEMO_DATASET_ID,
      showImport: false,
      showHelp: false,
      sampleOutbreak: true,
    };
  }

  // Routine-analysis counterpart to the outbreak sample: opens the monthly
  // district surveillance dataset in the Analysis module.
  if (sample === 'surveillance') {
    return {
      activeModule: 'analysis',
      activeDatasetId: DEMO_SURVEILLANCE_DATASET_ID,
      showImport: false,
      showHelp: false,
      sampleOutbreak: false,
    };
  }

  return {
    // A tool's own address (/app/epicurve/, /app/maps/, ...) opens that tool.
    activeModule: moduleFromPath(window.location.pathname) ?? 'dashboard',
    showImport: action === 'import',
    // Lets the marketing site link straight into the Help Center at /app/?action=help
    showHelp: action === 'help',
    sampleOutbreak: false,
  };
}

/**
 * Parse a stored dataset list, keeping only entries the app can render.
 * Returns null when the value is not a list at all.
 */
function parseStoredDatasets(raw: string | null): Dataset[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(sanitizeDataset).filter((d): d is Dataset => d !== null);
  } catch {
    return null;
  }
}

function loadInitialDatasets(ensureDatasetId?: string): Dataset[] {
  // Parse persisted datasets defensively: corrupted or blocked localStorage
  // must not crash the app at startup. On failure, drop the corrupt key and
  // start empty, as on a first visit.
  const saved = readStorage('epikit_datasets');
  const stored = parseStoredDatasets(saved);
  if (stored === null && saved) removeStorage('epikit_datasets');
  const savedVersion = readStorage('epikit_demoDataVersion');
  const samplesAreCurrent = !!savedVersion && Number(savedVersion) >= SAMPLE_DATA_VERSION;
  return prepareStartingDatasets(stored, samplesAreCurrent, ensureDatasetId);
}

// =============================================================================
// MAIN APPLICATION COMPONENT
// =============================================================================

function App() {
  // Locale settings for number formatting (decimal/thousand separators)
  const { config: localeConfig } = useLocale();
  const [initialEntry] = useState<InitialAppEntry>(() => getInitialAppEntry());

  // ---------------------------------------------------------------------------
  // UI STATE - Controls which module/modal is currently visible
  // ---------------------------------------------------------------------------
  const [activeModule, setActiveModule] = useState<Module>(initialEntry.activeModule);
  const [showImport, setShowImport] = useState(initialEntry.showImport);
  const [showSampleGuide, setShowSampleGuide] = useState(initialEntry.sampleOutbreak);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(initialEntry.showHelp);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const [showLocaleSettings, setShowLocaleSettings] = useState(false);
  const [showProjectLoadConfirm, setShowProjectLoadConfirm] = useState<{ project: ReturnType<typeof parseProjectFile>; filename: string } | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  // 'save': a routine save failed. 'project': a loaded project is too large
  // to keep, so it is open for this session only.
  const [showStorageWarning, setShowStorageWarning] = useState<false | 'save' | 'project'>(false);
  // True while this tab holds work that storage does not, so that another
  // tab's save is not allowed to replace it.
  const unsavedRef = useRef(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // DATASET STATE
  // Core data storage - shared across Review and Analysis modules.
  // Each dataset has columns (schema) and records (rows of data).
  // ---------------------------------------------------------------------------
  const [datasets, setDatasets] = useState<Dataset[]>(() => {
    return loadInitialDatasets(initialEntry.activeDatasetId);
  });

  // Which dataset is currently selected for viewing/editing
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(() => {
    if (initialEntry.activeDatasetId) return initialEntry.activeDatasetId;
    // Nothing is selected on a first visit; there is no data until the person
    // imports a file or opens a sample.
    return readStorage('epikit_activeDatasetId') || null;
  });

  // ---------------------------------------------------------------------------
  // EDIT LOG - AUDIT TRAIL
  // Tracks all data modifications for transparency and reproducibility.
  // Each entry records: what changed, old/new values, reason, and who made it.
  // ---------------------------------------------------------------------------
  const [editLog, setEditLog] = useState<EditLogEntry[]>(() => {
    const saved = readStorage('epikit_editLog');
    try {
      const parsed: unknown = saved ? JSON.parse(saved) : null;
      if (parsed === null) return [];
      if (Array.isArray(parsed)) return sanitizeEditLog(parsed);
    } catch {
      // fall through to dropping the corrupt entry
    }
    removeStorage('epikit_editLog');
    return [];
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

  /** Delete a dataset, clean up its edit log entries, and select another dataset if needed */
  const deleteDataset = useCallback((id: string) => {
    setDatasets(prev => {
      const remaining = prev.filter(d => d.id !== id);
      // Auto-select another dataset if the deleted one was active
      if (activeDatasetId === id) {
        setActiveDatasetId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
    // Clean up edit log entries for the deleted dataset
    setEditLog(prev => prev.filter(entry => entry.datasetId !== id));
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
  // DEMO DATA VERSION CHECK
  // Initial dataset loading refreshes stale demo datasets; this effect records
  // the deployed demo-data version after the initial state has been built.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    writeStorage('epikit_demoDataVersion', String(SAMPLE_DATA_VERSION));
  }, []);

  // ---------------------------------------------------------------------------
  // ADDRESS BAR <-> OPEN TOOL
  // Each tool has its own address, so a link can open it directly, Back and
  // Forward move between tools, and page analytics can count tool use.
  // ---------------------------------------------------------------------------
  const addressSyncedRef = useRef(false);
  useEffect(() => {
    const target = pathForModule(activeModule);
    if (!addressSyncedRef.current) {
      // First render: replace rather than push, so Back still leaves the app.
      // This also drops the ?sample= and ?action= links, which are one-shot
      // instructions: left in the address bar, a reload would reopen the
      // import dialog or drag the user back to the sample after they had
      // moved on to their own data. (?sample=outbreak becomes /app/epicurve/.)
      addressSyncedRef.current = true;
      if (window.location.pathname !== target || window.location.search) {
        window.history.replaceState(null, '', target + window.location.hash);
      }
      return;
    }
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target);
    }
  }, [activeModule]);

  useEffect(() => {
    const onPopState = () => {
      setActiveModule(moduleFromPath(window.location.pathname) ?? 'dashboard');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ---------------------------------------------------------------------------
  // AUTO-SAVE TO LOCALSTORAGE
  // All state changes are automatically persisted so users don't lose work.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (saveDatasets(datasets)) {
      unsavedRef.current = false;
      return;
    }
    unsavedRef.current = true;
    // Defer so the warning isn't set synchronously inside the effect body
    const timer = setTimeout(() => setShowStorageWarning(current => current || 'save'), 0);
    return () => clearTimeout(timer);
  }, [datasets]);

  useEffect(() => {
    if (saveEditLog(editLog)) return;
    const timer = setTimeout(() => setShowStorageWarning(current => current || 'save'), 0);
    return () => clearTimeout(timer);
  }, [editLog]);

  // ---------------------------------------------------------------------------
  // STAY IN STEP WITH OTHER TABS
  // Every save writes the whole dataset list. A second tab opened earlier (the
  // homepage links open one) holds an older copy, and its next save would
  // silently discard whatever this tab imported in the meantime. Adopting the
  // other tab's save when it happens keeps both copies current. Re-saving the
  // adopted value writes identical text, which raises no further event.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      // Work that could not be saved here exists nowhere else; keep it.
      if (unsavedRef.current) return;
      if (event.key === 'epikit_datasets') {
        const incoming = parseStoredDatasets(event.newValue);
        if (incoming) setDatasets(incoming);
      } else if (event.key === 'epikit_editLog' && event.newValue) {
        try {
          setEditLog(sanitizeEditLog(JSON.parse(event.newValue)));
        } catch {
          // Ignore a value this tab cannot read.
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (activeDatasetId) {
      saveActiveDatasetId(activeDatasetId);
    }
  }, [activeDatasetId]);

  const addEditLogEntry = useCallback((entry: EditLogEntry) => {
    setEditLog(prev => {
      const next = [...prev, entry];
      // Show backup reminder every 20 edits if not already shown recently
      try {
        const lastReminder = localStorage.getItem('epikit_lastBackupReminder');
        const lastReminderTime = lastReminder ? Number(lastReminder) : 0;
        const hoursSinceReminder = (Date.now() - lastReminderTime) / (1000 * 60 * 60);
        if (next.length > 0 && next.length % 20 === 0 && hoursSinceReminder > 4) {
          setShowBackupReminder(true);
          localStorage.setItem('epikit_lastBackupReminder', String(Date.now()));
        }
      } catch {
        // Storage unavailable (quota/private mode) — skip the reminder timestamp
      }
      return next;
    });
  }, []);

  const updateEditLogEntry = useCallback((id: string, updates: Partial<EditLogEntry>) => {
    setEditLog(prev => prev.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  }, []);

  const removeEditLogEntry = useCallback((id: string) => {
    setEditLog(prev => prev.filter(entry => entry.id !== id));
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

  /** Open a sample: load it into this browser if it is not here yet, then select it. */
  const openSample = useCallback((id: string) => {
    setDatasets(prev => {
      if (prev.some(d => d.id === id)) return prev;
      const sample = createSampleDataset(id);
      return sample ? [sample, ...prev] : prev;
    });
    setActiveDatasetId(id);
  }, []);

  /**
   * Put a sample back as it shipped, dropping the edits made to it, so a
   * class can repeat an exercise from the same starting point.
   */
  const resetSample = useCallback((id: string) => {
    const fresh = createSampleDataset(id);
    if (!fresh) return;
    setDatasets(prev => prev.map(d => (d.id === id ? fresh : d)));
    setEditLog(prev => prev.filter(entry => entry.datasetId !== id));
  }, []);

  // The introductory walkthrough in Help opens the outbreak sample.
  const handleLoadDemo = useCallback(() => openSample(DEMO_DATASET_ID), [openSample]);

  // Handle navigation from onboarding/help
  const handleNavigateToModule = useCallback((module: string) => {
    setActiveModule(module as Module);
  }, []);

  // Recover from a module crash: send the user back to the dashboard
  const handleResetModuleError = useCallback(() => {
    setActiveModule('dashboard');
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

    // Group updates by record first: filtering the whole update list for every
    // record made a recode of a large dataset take many seconds.
    const updatesByRecord = new Map<string, typeof updates>();
    for (const update of updates) {
      const list = updatesByRecord.get(update.recordId);
      if (list) list.push(update);
      else updatesByRecord.set(update.recordId, [update]);
    }
    const updatedRecords = activeDataset.records.map(record => {
      const recordUpdates = updatesByRecord.get(record.id);
      if (!recordUpdates) return record;

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
        alert('Invalid project file. Please select a valid LineList project file.');
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

    // Write the data before anything else and find out whether it fits. This
    // used to reload unconditionally: a project too large for browser storage
    // then vanished on reload with no message, which is exactly the backup the
    // storage-full warning tells people to make.
    const stored = saveDatasets(project.datasets) && saveEditLog(project.editLog);

    // Load all project data
    setDatasets(project.datasets);
    setActiveDatasetId(project.activeDatasetId);
    setEditLog(project.editLog);

    // Restore analysis states to localStorage
    if (project.analysisState) {
      writeStorage('epikit_analysis_state', JSON.stringify(project.analysisState));
    }

    // Restore each module's own saved work: epi-curve annotations and binning,
    // map configuration, table and 2x2 setups. Without this the import brought
    // back the data and none of the analysis.
    restoreModuleState(project.moduleState);

    setShowProjectLoadConfirm(null);
    // Leaving for the dashboard unmounts the open module, so each one reads
    // the restored setup when it is next opened.
    setActiveModule('dashboard');

    if (stored) {
      saveActiveDatasetId(project.activeDatasetId);
      // Reload so nothing mounted before the load is left showing stale setup.
      window.location.reload();
    } else {
      // Too large to keep: stay on this page, where the project is in memory,
      // and say so plainly.
      unsavedRef.current = true;
      setShowStorageWarning('project');
    }
  }, [showProjectLoadConfirm]);

  // Check if current module needs dataset selector
  const showDatasetSelector = ['review', 'epicurve', 'maps', 'analysis', 'visualize'].includes(activeModule);

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <nav className="bg-slate-800 text-white px-3 sm:px-6 py-2 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => { setActiveModule('dashboard'); setShowMobileMenu(false); }}
              className="text-lg sm:text-xl font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              LineList
            </button>
            {/* Desktop nav links */}
            <div className="hidden md:flex gap-0.5">
              {([
                ['review', 'Review/Clean'],
                ['epicurve', 'Epi Curve'],
                ['maps', 'Maps'],
                ['analysis', 'Analysis'],
                ['visualize', 'Visualize'],
              ] as const).map(([mod, label], i) => (
                <span key={mod} className="contents">
                  {i === 1 && <span className="w-px bg-slate-600 mx-1" />}
                  <button
                    onClick={() => setActiveModule(mod as Module)}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      activeModule === mod
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                </span>
              ))}
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
            {/* Desktop toolbar buttons */}
            <div className="hidden sm:flex items-center gap-2">
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
              <span className="w-px h-6 bg-slate-600 mx-1" />
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
            </div>
            <a
              href={FEEDBACK_MAILTO}
              className="hidden sm:flex items-center gap-1.5 px-2 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label={`Send feedback by email to ${FEEDBACK_EMAIL}`}
              title={`Report an error or suggest an improvement: ${FEEDBACK_EMAIL}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="hidden lg:inline">Feedback</span>
            </a>
            {/* Mobile hamburger button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Menu"
              title="Menu"
            >
              {showMobileMenu ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {showMobileMenu && (
          <div className="md:hidden absolute left-0 right-0 top-full bg-slate-800 border-t border-slate-700 shadow-lg z-50">
            <div className="px-3 py-2 space-y-1">
              {([
                ['review', 'Review/Clean'],
                ['epicurve', 'Epi Curve'],
                ['maps', 'Maps'],
                ['analysis', 'Analysis'],
                ['visualize', 'Visualize'],
              ] as const).map(([mod, label]) => (
                <button
                  key={mod}
                  onClick={() => { setActiveModule(mod as Module); setShowMobileMenu(false); }}
                  className={`w-full text-left px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                    activeModule === mod
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-700 px-3 py-2">
              <div className="flex items-center justify-around">
                <button
                  onClick={() => { handleSaveProject(); setShowMobileMenu(false); }}
                  className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white rounded-lg transition-colors"
                  aria-label="Save Project"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span className="text-xs">Save</span>
                </button>
                <button
                  onClick={() => { handleLoadProjectClick(); setShowMobileMenu(false); }}
                  className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white rounded-lg transition-colors"
                  aria-label="Load Project"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span className="text-xs">Load</span>
                </button>
                <button
                  onClick={() => { setShowLocaleSettings(true); setShowMobileMenu(false); }}
                  className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white rounded-lg transition-colors"
                  aria-label="Language"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  <span className="text-xs">Language</span>
                </button>
                <button
                  onClick={() => { setShowAccessibilitySettings(true); setShowMobileMenu(false); }}
                  className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white rounded-lg transition-colors"
                  aria-label="Accessibility"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs">Access.</span>
                </button>
                <button
                  onClick={() => { setShowHelpCenter(true); setShowMobileMenu(false); }}
                  className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white rounded-lg transition-colors"
                  aria-label="Help"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs">Help</span>
                </button>
              </div>
            </div>
            <div className="border-t border-slate-700 px-3 py-2 text-center">
              <a href={FEEDBACK_MAILTO} className="text-sm text-slate-300 hover:text-white underline underline-offset-2">
                Send feedback: {FEEDBACK_EMAIL}
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Mobile menu backdrop */}
      {showMobileMenu && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      {/* Dataset selector bar */}
      {showDatasetSelector && (
        // One row on every screen: on a phone the bar used to stack into two,
        // and each row taken here is one fewer row of data in Review/Clean.
        <div className="bg-gray-100 border-b border-gray-200 px-3 sm:px-4 py-2 flex flex-row items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
            <label htmlFor="active-dataset" className="sr-only sm:not-sr-only text-sm font-medium text-gray-700 shrink-0">Dataset:</label>
            <select
              id="active-dataset"
              value={activeDatasetId || ''}
              onChange={(e) => setActiveDatasetId(e.target.value || null)}
              // Truncated, with a zero basis on narrow screens: Safari counts a
              // long dataset name inside the control as page overflow
              // otherwise, and the whole app could be dragged sideways on a
              // phone.
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white truncate min-w-0 w-0 flex-1 sm:flex-none sm:w-auto sm:min-w-[200px] sm:max-w-xl"
            >
              <option value="">Select a dataset...</option>
              {datasets.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.records.length} records){isSampleDataset(d.id) ? ' — Synthetic sample' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowImport(true)}
              className="px-2 sm:px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Import<span className="hidden sm:inline"> Data</span>
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

      {initialEntry.sampleOutbreak && activeDatasetId === DEMO_DATASET_ID && activeModule === 'epicurve' && showSampleGuide && (
        <div role="status" className="border-b border-blue-200 bg-blue-50 px-3 sm:px-4 py-2.5 text-sm text-blue-950">
          <div className="mx-auto grid max-w-5xl grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2">
            <span className="mt-0.5 shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
              Synthetic sample
            </span>
            <p className="col-span-3 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <strong>Start here:</strong> This completed curve uses 12-hour bins and case-status strata. Try changing <strong>Bin Size</strong> or <strong>Stratify By</strong>, then export the result.
            </p>
            <button
              type="button"
              onClick={() => setShowSampleGuide(false)}
              className="col-start-3 row-start-1 shrink-0 rounded px-2 py-0.5 font-medium text-blue-700 hover:bg-blue-100 hover:text-blue-900"
              aria-label="Dismiss sample guidance"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeModule === 'dashboard' ? (
          <Dashboard
            datasets={datasets}
            onNavigate={handleNavigateToModule}
            onImportData={() => setShowImport(true)}
            onSelectDataset={(id) => setActiveDatasetId(id)}
            onDeleteDataset={deleteDataset}
          />
        ) : activeModule === 'tutorial' ? (
          <Tutorial
            datasets={datasets}
            onOpenSample={openSample}
            onResetSample={resetSample}
            onRemoveSample={deleteDataset}
            onNavigate={handleNavigateToModule}
            onImportData={() => setShowImport(true)}
            onOpenHelp={() => setShowHelpCenter(true)}
          />
        ) : activeDataset ? (
          // Modules that require a dataset. Each is lazily loaded, so a shared
          // Suspense boundary shows a spinner while the module chunk downloads.
          <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-white"><LoadingSpinner size="lg" message="Loading module…" /></div>}>
          {activeModule === 'review' ? (
            <ErrorBoundary key="review" moduleName="Review/Clean" onReset={handleResetModuleError}>
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
                removeEditLogEntry={removeEditLogEntry}
                getEditLogForDataset={getEditLogForDataset}
                exportEditLog={exportEditLog}
              />
            </ErrorBoundary>
          ) : activeModule === 'epicurve' ? (
            <ErrorBoundary key="epicurve" moduleName="Epi Curve" onReset={handleResetModuleError}>
              <EpiCurve
                key={`${activeDataset.id}-${initialEntry.sampleOutbreak && activeDataset.id === DEMO_DATASET_ID ? 'sample' : 'default'}`}
                dataset={activeDataset}
                onExportDataset={handleDatasetExport}
                preset={initialEntry.sampleOutbreak && activeDataset.id === DEMO_DATASET_ID ? 'sample-outbreak' : undefined}
              />
            </ErrorBoundary>
          ) : activeModule === 'maps' ? (
            <ErrorBoundary key="maps" moduleName="Maps" onReset={handleResetModuleError}>
              <Maps dataset={activeDataset} datasets={datasets} />
            </ErrorBoundary>
          ) : activeModule === 'analysis' ? (
            <ErrorBoundary key="analysis" moduleName="Analysis" onReset={handleResetModuleError}>
              <AnalysisWorkflow
                dataset={activeDataset}
                onCreateVariable={handleCreateVariable}
                onUpdateRecords={handleUpdateRecords}
              />
            </ErrorBoundary>
          ) : activeModule === 'visualize' ? (
            <ErrorBoundary key="visualize" moduleName="Visualize" onReset={handleResetModuleError}>
              <VisualizeWorkflow dataset={activeDataset} />
            </ErrorBoundary>
          ) : null}
          </Suspense>
        ) : (
          // No dataset selected. A link to a tool (/app/epicurve/ on a
          // workshop slide) can arrive here before there is any data at all,
          // so offer the tutorial's samples as well as an import.
          <div className="h-full flex items-center justify-center bg-white">
            <div className="text-center p-8 max-w-md">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg text-gray-700">
                {datasets.length === 0 ? 'No data yet' : 'Select a dataset above to begin'}
              </p>
              {datasets.length === 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  Import your own file, or practice with an example dataset in the tutorial.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setShowImport(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Import data
                </button>
                {datasets.length === 0 && (
                  <button
                    onClick={() => setActiveModule('tutorial')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    Open the tutorial
                  </button>
                )}
              </div>
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
      {/* Backup Reminder Toast */}
      {showBackupReminder && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
          <div className="bg-white rounded-xl shadow-lg border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Back up your work?</p>
                <p className="text-xs text-gray-500 mt-1">Your data exist only in this browser. Save a project backup to keep them safe.</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { handleSaveProject(); setShowBackupReminder(false); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Save Backup
                  </button>
                  <button
                    onClick={() => setShowBackupReminder(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Storage Full Warning Toast */}
      {showStorageWarning && (
        <div className="fixed bottom-4 left-4 z-50 max-w-sm animate-slide-up">
          <div className="bg-white rounded-xl shadow-lg border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {showStorageWarning === 'project' ? 'This project is too large to keep in this browser' : 'Your latest changes were not saved'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {showStorageWarning === 'project'
                    ? 'It is open now, but it will not be here after you close or reload this tab. Keep the project file, and load it again when you return.'
                    : "This browser's storage is full or blocked, so the changes exist only in this tab. Save a project file now to keep your work."}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { handleSaveProject(); setShowStorageWarning(false); }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Save Backup
                  </button>
                  <button
                    onClick={() => setShowStorageWarning(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Load Confirmation Modal */}
      {showProjectLoadConfirm && (
        <Dialog
          onClose={() => setShowProjectLoadConfirm(null)}
          labelledBy="load-project-title"
          className="max-w-md p-6 rounded-xl"
        >
            <h3 id="load-project-title" className="text-lg font-semibold text-gray-900 mb-2">Load Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Loading <span className="font-medium">{showProjectLoadConfirm.filename}</span> will replace all current data including:
            </p>
            <ul className="text-sm text-gray-600 mb-4 space-y-1 ml-4">
              <li>• {showProjectLoadConfirm.project?.datasets?.length ?? 0} dataset(s)</li>
              <li>• {showProjectLoadConfirm.project?.editLog?.length ?? 0} edit log entries</li>
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
        </Dialog>
      )}
    </div>
  );
}

export default App;
