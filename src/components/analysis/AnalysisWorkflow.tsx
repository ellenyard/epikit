/**
 * AnalysisWorkflow Component
 *
 * The main analysis interface following an "Explore -> Build -> Test" workflow.
 * This mirrors the natural progression of an epidemiological investigation:
 *
 * 1. EXPLORE: Examine individual variables
 *    - View distributions (histograms, frequency tables)
 *    - Check for missing values and data quality
 *    - Recode or fix values if needed
 *
 * 2. BUILD TABLES: Create publication-ready tables
 *    - One-way frequency tables (single variable)
 *    - Two-way cross-tabulations (row × column)
 *    - Export to CSV for reports
 *
 * 3. TEST (2×2): Hypothesis testing
 *    - Calculate odds ratios, risk ratios
 *    - Chi-square and Fisher's exact tests
 *    - Confidence intervals
 *
 * State Persistence:
 * - Each dataset has its own saved state (selected variables, active tab)
 * - State is saved to localStorage and restored when switching datasets
 *
 * Cross-Tab Communication:
 * - "Build table with this variable" in Explorer -> pre-populates Table Builder
 * - "Run 2×2 with this exposure" in Explorer -> pre-populates 2×2 Analysis
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dataset, VariableConfig } from '../../types/analysis';
import { VariableExplorer } from './VariableExplorer';
import { TableBuilder } from './TableBuilder';
import { TwoByTwoAnalysis } from './TwoByTwoAnalysis';

interface AnalysisWorkflowProps {
  dataset: Dataset;
  /** Callback when user creates a new variable (passed up to App.tsx) */
  onCreateVariable?: (config: VariableConfig, values: unknown[]) => void;
  /** Callback for bulk record updates (e.g., recoding values) */
  onUpdateRecords?: (updates: Array<{ recordId: string; field: string; value: unknown }>) => void;
}

/** The three workflow steps */
type SubTab = 'explore' | 'build' | 'test';

/** State that gets persisted to localStorage per dataset */
interface PersistedState {
  activeSubTab: SubTab;
  explorerSelectedVar: string;
  tableBuilderRowVars: string[];
  tableBuilderColVar: string;
}

// Each dataset gets its own localStorage key for persistence
const STORAGE_KEY_PREFIX = 'epikit_analysis_workflow_';

/** Load saved workflow state for a specific dataset */
function loadWorkflowState(datasetId: string): PersistedState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + datasetId);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/** Save workflow state for a specific dataset */
function saveWorkflowState(datasetId: string, state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + datasetId, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save workflow state:', e);
  }
}

export function AnalysisWorkflow({ dataset, onCreateVariable, onUpdateRecords }: AnalysisWorkflowProps) {
  // -------------------------------------------------------------------------
  // STATE MANAGEMENT
  // State is persisted per-dataset so users can switch between datasets
  // without losing their place in each one's analysis.
  // -------------------------------------------------------------------------

  // Track previous dataset ID to detect actual changes (vs re-renders)
  const prevDatasetIdRef = useRef<string>(dataset.id);

  // Which workflow step is currently active
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(() => {
    const saved = loadWorkflowState(dataset.id);
    return saved?.activeSubTab || 'explore';
  });

  // Persisted state for child components - lifted here for cross-tab sharing
  const [explorerSelectedVar, setExplorerSelectedVar] = useState<string>(() => {
    const saved = loadWorkflowState(dataset.id);
    return saved?.explorerSelectedVar || '';
  });

  const [tableBuilderRowVars, setTableBuilderRowVars] = useState<string[]>(() => {
    const saved = loadWorkflowState(dataset.id);
    return saved?.tableBuilderRowVars || [];
  });

  const [tableBuilderColVar, setTableBuilderColVar] = useState<string>(() => {
    const saved = loadWorkflowState(dataset.id);
    return saved?.tableBuilderColVar || '';
  });

  // -------------------------------------------------------------------------
  // CROSS-TAB COMMUNICATION
  // These handle the "quick action" buttons that jump between tabs with
  // pre-selected variables. Not persisted since they're transient.
  // -------------------------------------------------------------------------
  const [preSelectedRowVars, setPreSelectedRowVars] = useState<string[]>([]);
  const [preSelectedExposure, setPreSelectedExposure] = useState<string | undefined>();

  // Reload state only when dataset ACTUALLY changes (not on mount)
  useEffect(() => {
    if (prevDatasetIdRef.current !== dataset.id) {
      prevDatasetIdRef.current = dataset.id;
      const saved = loadWorkflowState(dataset.id);
      if (saved) {
        setActiveSubTab(saved.activeSubTab);
        setExplorerSelectedVar(saved.explorerSelectedVar);
        setTableBuilderRowVars(saved.tableBuilderRowVars);
        setTableBuilderColVar(saved.tableBuilderColVar);
      } else {
        // Reset to defaults for new dataset
        setActiveSubTab('explore');
        setExplorerSelectedVar('');
        setTableBuilderRowVars([]);
        setTableBuilderColVar('');
      }
    }
  }, [dataset.id]);

  // Auto-save state when it changes
  useEffect(() => {
    saveWorkflowState(dataset.id, {
      activeSubTab,
      explorerSelectedVar,
      tableBuilderRowVars,
      tableBuilderColVar,
    });
  }, [dataset.id, activeSubTab, explorerSelectedVar, tableBuilderRowVars, tableBuilderColVar]);

  // Callback: Navigate from Explorer to Table Builder with pre-selected variable
  const handleBuildTable = useCallback((varKey: string) => {
    setPreSelectedRowVars([varKey]);
    setActiveSubTab('build');
  }, []);

  // Callback: Navigate from Explorer to 2x2 Analysis with pre-selected exposure
  const handleRunTwoByTwo = useCallback((varKey: string) => {
    setPreSelectedExposure(varKey);
    setActiveSubTab('test');
  }, []);

  // Clear pre-selections when switching tabs manually
  const handleTabChange = useCallback((tab: SubTab) => {
    if (tab !== 'build') {
      setPreSelectedRowVars([]);
    }
    if (tab !== 'test') {
      setPreSelectedExposure(undefined);
    }
    setActiveSubTab(tab);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Sub-navigation with workflow arrows */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTabChange('explore')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === 'explore'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              1. Explore
            </button>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => handleTabChange('build')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === 'build'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              2. Build Tables
            </button>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => handleTabChange('test')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSubTab === 'test'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              3. Test (2x2)
            </button>
          </div>
          <span className="text-xs text-gray-400 ml-4">
            Explore your data, build report tables, test hypotheses
          </span>
        </div>
      </div>

      {/* Content - all tabs rendered but inactive ones hidden to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 overflow-auto ${activeSubTab === 'explore' ? '' : 'hidden'}`}>
          <VariableExplorer
            dataset={dataset}
            onBuildTable={handleBuildTable}
            onRunTwoByTwo={handleRunTwoByTwo}
            selectedVar={explorerSelectedVar}
            onSelectedVarChange={setExplorerSelectedVar}
            onCreateVariable={onCreateVariable}
            onUpdateRecords={onUpdateRecords}
          />
        </div>

        <div className={`absolute inset-0 overflow-auto ${activeSubTab === 'build' ? '' : 'hidden'}`}>
          <TableBuilder
            dataset={dataset}
            initialRowVars={preSelectedRowVars}
            onRowVarsUsed={() => setPreSelectedRowVars([])}
            rowVars={tableBuilderRowVars}
            onRowVarsChange={setTableBuilderRowVars}
            colVar={tableBuilderColVar}
            onColVarChange={setTableBuilderColVar}
          />
        </div>

        <div className={`absolute inset-0 overflow-auto ${activeSubTab === 'test' ? '' : 'hidden'}`}>
          <TwoByTwoAnalysis
            dataset={dataset}
            initialExposure={preSelectedExposure}
          />
        </div>
      </div>
    </div>
  );
}
