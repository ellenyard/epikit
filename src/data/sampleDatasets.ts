/**
 * The bundled sample datasets, and how they come to be in a browser.
 *
 * The samples used to be written into every new browser on its first visit,
 * so a newcomer opened LineList to a list of three datasets they had not made,
 * and the app home could never tell a first visit from a returning one. They
 * now load only when someone opens one from the tutorial (or from a
 * ?sample= link), and a browser that already holds them keeps them.
 */
import type { Dataset } from '../types/analysis';
import {
  demoColumns,
  demoCaseRecords,
  nutritionDemoColumns,
  nutritionDemoRecords,
  surveillanceDemoColumns,
  surveillanceDemoRecords,
  SAMPLE_DATASET_IDS,
} from './demoData';

export const [OUTBREAK_SAMPLE_ID, NUTRITION_SAMPLE_ID, SURVEILLANCE_SAMPLE_ID] = SAMPLE_DATASET_IDS;

/**
 * Bump whenever the sample data in demoData.ts changes. Copies of the samples
 * saved under an older version are replaced with the current ones.
 */
export const SAMPLE_DATA_VERSION = 8;

function build(id: string, name: string, columns: Dataset['columns'], records: Dataset['records']): Dataset {
  const now = new Date().toISOString();
  return { id, name, source: 'form', columns, records, createdAt: now, updatedAt: now };
}

const SAMPLE_FACTORIES: Record<string, () => Dataset> = {
  [OUTBREAK_SAMPLE_ID]: () =>
    build(OUTBREAK_SAMPLE_ID, 'Foodborne Outbreak Investigation', demoColumns, demoCaseRecords),
  [NUTRITION_SAMPLE_ID]: () =>
    build(NUTRITION_SAMPLE_ID, 'Child Nutrition Survey - Rapid Assessment', nutritionDemoColumns, nutritionDemoRecords),
  [SURVEILLANCE_SAMPLE_ID]: () =>
    build(SURVEILLANCE_SAMPLE_ID, 'Disease Surveillance - Monthly Reports', surveillanceDemoColumns, surveillanceDemoRecords),
};

/** A fresh copy of a sample, or null when the id is not a sample. */
export function createSampleDataset(id: string): Dataset | null {
  const factory = SAMPLE_FACTORIES[id];
  return factory ? factory() : null;
}

/** Size of a sample as shipped, for describing it before it is opened. */
export function sampleSize(id: string): { records: number; variables: number } {
  switch (id) {
    case OUTBREAK_SAMPLE_ID: return { records: demoCaseRecords.length, variables: demoColumns.length };
    case NUTRITION_SAMPLE_ID: return { records: nutritionDemoRecords.length, variables: nutritionDemoColumns.length };
    case SURVEILLANCE_SAMPLE_ID: return { records: surveillanceDemoRecords.length, variables: surveillanceDemoColumns.length };
    default: return { records: 0, variables: 0 };
  }
}

/**
 * The dataset list to start the app with.
 *
 * - `stored` is what this browser saved, or null on a first visit (or when
 *   the saved value could not be read). Nothing is added for a first visit.
 * - When `samplesAreCurrent` is false, any sample the browser already holds is
 *   replaced, in place, by the current version. Samples it does not hold are
 *   not added.
 * - `ensureSampleId` is a sample a link asked to open (?sample=outbreak); it
 *   is added at the front when missing.
 */
export function prepareStartingDatasets(
  stored: Dataset[] | null,
  samplesAreCurrent: boolean,
  ensureSampleId?: string,
): Dataset[] {
  let datasets = stored ?? [];
  if (!samplesAreCurrent) {
    datasets = datasets.map((d) => createSampleDataset(d.id) ?? d);
  }
  if (ensureSampleId && !datasets.some((d) => d.id === ensureSampleId)) {
    const sample = createSampleDataset(ensureSampleId);
    if (sample) datasets = [sample, ...datasets];
  }
  return datasets;
}
