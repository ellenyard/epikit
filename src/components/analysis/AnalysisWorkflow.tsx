import { useState, useCallback, useEffect, useRef } from 'react';
import type { Dataset, VariableConfig } from '../../types/analysis';
import { VariableExplorer } from './VariableExplorer';
import { TableBuilder } from './TableBuilder';
import { TwoByTwoAnalysis } from './TwoByTwoAnalysis';

interface AnalysisWorkflowProps {
  dataset: Dataset;
  onCreateVariable?: (config: VariableConfig, values: unknown[]) => void;
  onUpdateRecords?: (updates: Array<{ recordId: string; field: string; value: unknown }>) => void;
}

type SubTab = 'explore' | 'build' | 'test';

interface PersistedState {
  activeSubTab: SubTab;
  explorerSelectedVar: string;
  tableBuilderRowVars: string[];
  tableBuilderColVar: string;
}

const STORAGE_KEY_PREFIX = 'epikit_analysis_workflow_';

function loadWorkflowState(datasetId: string): PersistedState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + datasetId);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveWorkflowState(datasetId: string, state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + datasetId, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save workflow state:', e);
  }
}

/**
 * AnalysisWorkflow: Parent container for the "Explore -> Build -> Test" workflow
 *
 * Follows the natural investigation progression:
 * - Variable Explorer: Quick exploration of individual variables
 * - Table Builder: Create report-ready tables (1-way and cross-tabs)
 * - 2x2 Analysis: Test hypotheses with measures of association
 */
export function AnalysisWorkflow({ dataset, onCreateVariable, onUpdateRecords }: AnalysisWorkflowProps) {
  // Track previous dataset ID to detect actual changes
  const prevDatasetIdRef = useRef<string>(dataset.id);

  // Load persisted state for this dataset
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(() => {
    const saved = loadWorkflowState(dataset.id);
    return saved?.activeSubTab || 'explore';
  });

  // Persisted state for child components
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

  // State for cross-tab communication (not persisted)
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
