/**
 * Persistence utilities for auto-saving app state to localStorage
 * and exporting/importing project files.
 */

import type { Dataset, EditLogEntry } from '../types/analysis';
import type { FormDefinition } from '../types/form';

const STORAGE_KEYS = {
  DATASETS: 'epikit_datasets',
  ACTIVE_DATASET_ID: 'epikit_activeDatasetId',
  FORM_DEFINITIONS: 'epikit_formDefinitions',
  CURRENT_FORM_ID: 'epikit_currentFormId',
  EDIT_LOG: 'epikit_editLog',
  ANALYSIS_STATE: 'epikit_analysis_state',
} as const;

// Version for project file format (for future compatibility)
const PROJECT_VERSION = '1.0';

export interface AnalysisState {
  // Variable Explorer
  explorerSelectedVar?: string;
  // Table Builder
  tableBuilderRowVars?: string[];
  tableBuilderColVar?: string;
  tableBuilderOptions?: {
    showN: boolean;
    showPercent: boolean;
    showCumPercent: boolean;
    includeMissing: boolean;
  };
  // 2x2 Analysis
  twoByTwoStudyDesign?: 'cohort' | 'case-control';
  twoByTwoOutcomeVar?: string;
  twoByTwoCaseValues?: string[];
  twoByTwoSelectedExposures?: string[];
  twoByTwoExposureValues?: Record<string, string>;
}

export interface ProjectData {
  version: string;
  exportedAt: string;
  datasets: Dataset[];
  activeDatasetId: string | null;
  formDefinitions: FormDefinition[];
  currentFormId: string | null;
  editLog: EditLogEntry[];
  analysisState: Record<string, AnalysisState>; // keyed by dataset ID
}

// ============ localStorage Functions ============

export function saveDatasets(datasets: Dataset[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DATASETS, JSON.stringify(datasets));
  } catch (e) {
    console.error('Failed to save datasets to localStorage:', e);
  }
}

export function loadDatasets(): Dataset[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DATASETS);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load datasets from localStorage:', e);
    return null;
  }
}

export function saveActiveDatasetId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DATASET_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_DATASET_ID);
    }
  } catch (e) {
    console.error('Failed to save active dataset ID:', e);
  }
}

export function loadActiveDatasetId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_DATASET_ID);
  } catch (e) {
    console.error('Failed to load active dataset ID:', e);
    return null;
  }
}

export function saveFormDefinitions(forms: FormDefinition[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FORM_DEFINITIONS, JSON.stringify(forms));
  } catch (e) {
    console.error('Failed to save form definitions:', e);
  }
}

export function loadFormDefinitions(): FormDefinition[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FORM_DEFINITIONS);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load form definitions:', e);
    return null;
  }
}

export function saveCurrentFormId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_FORM_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_FORM_ID);
    }
  } catch (e) {
    console.error('Failed to save current form ID:', e);
  }
}

export function loadCurrentFormId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_FORM_ID);
  } catch (e) {
    console.error('Failed to load current form ID:', e);
    return null;
  }
}

export function saveEditLog(editLog: EditLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EDIT_LOG, JSON.stringify(editLog));
  } catch (e) {
    console.error('Failed to save edit log:', e);
  }
}

export function loadEditLog(): EditLogEntry[] | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.EDIT_LOG);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load edit log:', e);
    return null;
  }
}

export function saveAnalysisState(datasetId: string, state: AnalysisState): void {
  try {
    const allStates = loadAllAnalysisStates() || {};
    allStates[datasetId] = state;
    localStorage.setItem(STORAGE_KEYS.ANALYSIS_STATE, JSON.stringify(allStates));
  } catch (e) {
    console.error('Failed to save analysis state:', e);
  }
}

export function loadAnalysisState(datasetId: string): AnalysisState | null {
  try {
    const allStates = loadAllAnalysisStates();
    return allStates?.[datasetId] || null;
  } catch (e) {
    console.error('Failed to load analysis state:', e);
    return null;
  }
}

export function loadAllAnalysisStates(): Record<string, AnalysisState> | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ANALYSIS_STATE);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load analysis states:', e);
    return null;
  }
}

export function clearAllAnalysisStates(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ANALYSIS_STATE);
  } catch (e) {
    console.error('Failed to clear analysis states:', e);
  }
}

// ============ Project Export/Import Functions ============

export function exportProject(
  datasets: Dataset[],
  activeDatasetId: string | null,
  formDefinitions: FormDefinition[],
  currentFormId: string | null,
  editLog: EditLogEntry[]
): ProjectData {
  const analysisStates = loadAllAnalysisStates() || {};

  return {
    version: PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    datasets,
    activeDatasetId,
    formDefinitions,
    currentFormId,
    editLog,
    analysisState: analysisStates,
  };
}

export function downloadProject(project: ProjectData, filename?: string): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `epikit_project_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseProjectFile(fileContent: string): ProjectData | null {
  try {
    const project = JSON.parse(fileContent) as ProjectData;

    // Validate required fields
    if (!project.version || !project.datasets || !Array.isArray(project.datasets)) {
      console.error('Invalid project file format');
      return null;
    }

    return project;
  } catch (e) {
    console.error('Failed to parse project file:', e);
    return null;
  }
}

// ============ Clear All Data ============

export function clearAllData(): void {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  } catch (e) {
    console.error('Failed to clear localStorage:', e);
  }
}

// ============ Storage Size Info ============

export function getStorageUsage(): { used: number; available: number; percentage: number } {
  try {
    let totalSize = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      const item = localStorage.getItem(key);
      if (item) {
        totalSize += item.length * 2; // UTF-16 = 2 bytes per char
      }
    }

    // localStorage typically has 5-10MB limit, assume 5MB to be safe
    const maxSize = 5 * 1024 * 1024;

    return {
      used: totalSize,
      available: maxSize - totalSize,
      percentage: (totalSize / maxSize) * 100,
    };
  } catch (e) {
    return { used: 0, available: 0, percentage: 0 };
  }
}
