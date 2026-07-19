/**
 * Persistence utilities for auto-saving app state to localStorage
 * and exporting/importing project files.
 */

import type { Dataset, EditLogEntry } from '../types/analysis';

const STORAGE_KEYS = {
  DATASETS: 'epikit_datasets',
  ACTIVE_DATASET_ID: 'epikit_activeDatasetId',
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
  editLog: EditLogEntry[];
  analysisState: Record<string, AnalysisState>; // keyed by dataset ID
}

// ============ localStorage Functions ============

export function saveDatasets(datasets: Dataset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.DATASETS, JSON.stringify(datasets));
    return true;
  } catch (e) {
    console.error('Failed to save datasets to localStorage:', e);
    return false;
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

export function saveActiveDatasetId(id: string | null): boolean {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DATASET_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_DATASET_ID);
    }
    return true;
  } catch (e) {
    console.error('Failed to save active dataset ID:', e);
    return false;
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

export function saveEditLog(editLog: EditLogEntry[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS.EDIT_LOG, JSON.stringify(editLog));
    return true;
  } catch (e) {
    console.error('Failed to save edit log:', e);
    return false;
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
  editLog: EditLogEntry[]
): ProjectData {
  const analysisStates = loadAllAnalysisStates() || {};

  return {
    version: PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    datasets,
    activeDatasetId,
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
  a.download = filename || `linelist_project_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseProjectFile(fileContent: string): ProjectData | null {
  try {
    const project = JSON.parse(fileContent) as Partial<ProjectData> | null;

    if (!project || typeof project !== 'object') {
      console.error('Invalid project file: not a JSON object');
      return null;
    }

    // Version check: reject files from an incompatible (different major) version
    const fileMajor = typeof project.version === 'string' ? project.version.split('.')[0] : null;
    if (fileMajor !== PROJECT_VERSION.split('.')[0]) {
      console.error(
        `Unsupported project file version: ${project.version ?? 'unknown'} (this app reads ${PROJECT_VERSION}.x files)`
      );
      return null;
    }

    // Deep-validate datasets — a malformed dataset crashes the app later
    if (!Array.isArray(project.datasets)) {
      console.error('Invalid project file: missing datasets');
      return null;
    }
    for (const d of project.datasets) {
      if (
        !d ||
        typeof d !== 'object' ||
        typeof d.id !== 'string' ||
        typeof d.name !== 'string' ||
        !Array.isArray(d.columns) ||
        !Array.isArray(d.records)
      ) {
        console.error('Invalid project file: malformed dataset entry');
        return null;
      }
    }
    const datasets = project.datasets;

    // Normalize optional fields so downstream code can trust the shape
    const editLog = Array.isArray(project.editLog) ? project.editLog : [];
    const activeDatasetId =
      typeof project.activeDatasetId === 'string' && datasets.some(d => d.id === project.activeDatasetId)
        ? project.activeDatasetId
        : datasets[0]?.id ?? null;
    const analysisState =
      project.analysisState && typeof project.analysisState === 'object' && !Array.isArray(project.analysisState)
        ? project.analysisState
        : {};

    return {
      version: project.version as string,
      exportedAt: typeof project.exportedAt === 'string' ? project.exportedAt : new Date().toISOString(),
      datasets,
      activeDatasetId,
      editLog,
      analysisState,
    };
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
  } catch {
    return { used: 0, available: 0, percentage: 0 };
  }
}
