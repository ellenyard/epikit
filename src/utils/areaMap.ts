import type { CaseRecord, DataColumn, Dataset } from '../types/analysis';

export type AreaMetric = 'count' | 'rate';
export type ClassificationMethod = 'equal' | 'quantile' | 'natural' | 'manual';

export interface GeoJsonFeature {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
  id?: string | number;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface JoinedArea {
  key: string;
  label: string;
  count: number;
  denominator: number | null;
  rate: number | null;
  value: number | null;
  feature: GeoJsonFeature;
}

export interface AreaJoinSummary {
  boundaryCount: number;
  matchedBoundaryCount: number;
  unmatchedBoundaryKeys: string[];
  unmatchedDataKeys: string[];
  unmatchedDenominatorKeys: string[];
  duplicateBoundaryKeys: string[];
  duplicateDataKeys: string[];
  duplicateDenominatorKeys: string[];
  missingDenominatorKeys: string[];
}

export interface AreaJoinResult {
  areas: JoinedArea[];
  summary: AreaJoinSummary;
}

export interface BuildAreaJoinOptions {
  records: CaseRecord[];
  areaField: string;
  boundaries: GeoJsonFeatureCollection;
  boundaryKey: string;
  metric: AreaMetric;
  denominatorDataset?: Dataset | null;
  denominatorKey?: string;
  denominatorValue?: string;
  rateMultiplier?: number;
}

export interface JoinReportRow extends CaseRecord {
  area_key: string;
  area_label: string;
  boundary_status: string;
  data_count: number;
  denominator: number | null;
  rate: number | null;
  issue: string;
}

export const joinReportColumns: DataColumn[] = [
  { key: 'area_key', label: 'Area Key', type: 'text' },
  { key: 'area_label', label: 'Area Label', type: 'text' },
  { key: 'boundary_status', label: 'Boundary Status', type: 'text' },
  { key: 'data_count', label: 'Data Count', type: 'number' },
  { key: 'denominator', label: 'Denominator', type: 'number' },
  { key: 'rate', label: 'Rate', type: 'number' },
  { key: 'issue', label: 'Issue', type: 'text' },
];

export function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GeoJsonFeatureCollection>;
  return candidate.type === 'FeatureCollection' && Array.isArray(candidate.features);
}

export function normalizeAreaKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function getGeoJsonPropertyKeys(boundaries: GeoJsonFeatureCollection | null): string[] {
  if (!boundaries) return [];
  const keys = new Set<string>();

  boundaries.features.slice(0, 25).forEach(feature => {
    Object.keys(feature.properties ?? {}).forEach(key => keys.add(key));
  });

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export function suggestAreaField(columns: DataColumn[]): string {
  const patterns = [
    /(^|_)(admin|adm|district|province|county|region|state|village|ward|area|zone|catchment|subcounty)(_|$)/,
    /district|province|county|region|state|village|ward|area|zone|catchment|subcounty/i,
  ];

  const match = columns.find(col => {
    const name = `${col.key} ${col.label}`;
    return patterns.some(pattern => pattern.test(name));
  });

  return match?.key ?? columns[0]?.key ?? '';
}

export function suggestBoundaryKey(keys: string[]): string {
  const patterns = [
    /^(id|code|name)$/i,
    /(admin|adm|district|province|county|region|state|village|ward|area|zone|name|code)/i,
  ];

  const match = keys.find(key => patterns.some(pattern => pattern.test(key)));
  return match ?? keys[0] ?? '';
}

export function buildAreaJoin(options: BuildAreaJoinOptions): AreaJoinResult {
  const {
    records,
    areaField,
    boundaries,
    boundaryKey,
    metric,
    denominatorDataset,
    denominatorKey,
    denominatorValue,
    rateMultiplier = 100000,
  } = options;

  const dataCounts = new Map<string, { label: string; count: number }>();
  records.forEach(record => {
    const rawValue = record[areaField];
    const key = normalizeAreaKey(rawValue);
    if (!key) return;

    const label = String(rawValue ?? '').trim();
    const existing = dataCounts.get(key);
    dataCounts.set(key, {
      label: existing?.label || label,
      count: (existing?.count ?? 0) + 1,
    });
  });

  const denominatorValues = new Map<string, { label: string; value: number }>();
  const denominatorRawCounts = new Map<string, number>();
  if (denominatorDataset && denominatorKey && denominatorValue) {
    denominatorDataset.records.forEach(record => {
      const key = normalizeAreaKey(record[denominatorKey]);
      if (!key) return;
      const parsed = parseNumber(record[denominatorValue]);
      const label = String(record[denominatorKey] ?? '').trim();
      if (parsed !== null) {
        const existing = denominatorValues.get(key);
        denominatorValues.set(key, {
          label: existing?.label || label,
          value: (existing?.value ?? 0) + parsed,
        });
      }
      denominatorRawCounts.set(label, (denominatorRawCounts.get(label) ?? 0) + 1);
    });
  }

  const boundarySeen = new Map<string, number>();
  const boundaryKeys = new Set<string>();
  const areas = boundaries.features.map(feature => {
    const rawBoundaryValue = feature.properties?.[boundaryKey];
    const key = normalizeAreaKey(rawBoundaryValue);
    const label = String(rawBoundaryValue ?? (key || 'Unnamed area')).trim();
    if (key) {
      boundarySeen.set(key, (boundarySeen.get(key) ?? 0) + 1);
      boundaryKeys.add(key);
    }

    const count = dataCounts.get(key)?.count ?? 0;
    const denominator = denominatorValues.get(key)?.value ?? null;
    const rate = metric === 'rate' && denominator && denominator > 0
      ? (count / denominator) * rateMultiplier
      : null;

    return {
      key,
      label,
      count,
      denominator,
      rate,
      value: metric === 'rate' ? rate : count,
      feature,
    };
  });

  const matchedBoundaryCount = areas.filter(area => area.count > 0 || area.denominator !== null).length;
  const unmatchedBoundaryKeys = areas
    .filter(area => area.key && !dataCounts.has(area.key) && !denominatorValues.has(area.key))
    .map(area => area.label)
    .sort((a, b) => a.localeCompare(b));
  const unmatchedDataKeys = Array.from(dataCounts.entries())
    .filter(([key]) => !boundaryKeys.has(key))
    .map(([, value]) => value.label)
    .sort((a, b) => a.localeCompare(b));
  const unmatchedDenominatorKeys = Array.from(denominatorValues.entries())
    .filter(([key]) => !boundaryKeys.has(key))
    .map(([, value]) => value.label)
    .sort((a, b) => a.localeCompare(b));
  const duplicateBoundaryKeys = Array.from(boundarySeen.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
  const duplicateDenominatorKeys = Array.from(denominatorRawCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));
  const missingDenominatorKeys = metric === 'rate'
    ? areas
        .filter(area => area.count > 0 && (!area.denominator || area.denominator <= 0))
        .map(area => area.label)
        .sort((a, b) => a.localeCompare(b))
    : [];

  return {
    areas,
    summary: {
      boundaryCount: boundaries.features.length,
      matchedBoundaryCount,
      unmatchedBoundaryKeys,
      unmatchedDataKeys,
      unmatchedDenominatorKeys,
      duplicateBoundaryKeys,
      duplicateDataKeys: [],
      duplicateDenominatorKeys,
      missingDenominatorKeys,
    },
  };
}

export function buildJoinReport(result: AreaJoinResult): JoinReportRow[] {
  const rows: JoinReportRow[] = result.areas.map(area => {
    const issues: string[] = [];
    if (area.count === 0) issues.push('No observation records');
    if (area.value === null) issues.push('No mapped value');
    if (area.count > 0 && (!area.denominator || area.denominator <= 0) && area.rate === null) {
      issues.push('Missing or zero denominator');
    }

    return {
      id: `boundary-${area.key || area.label}`,
      area_key: area.key,
      area_label: area.label,
      boundary_status: 'Boundary feature',
      data_count: area.count,
      denominator: area.denominator,
      rate: area.rate,
      issue: issues.join('; '),
    };
  });

  result.summary.unmatchedDataKeys.forEach(key => {
    rows.push({
      id: `data-${normalizeAreaKey(key)}`,
      area_key: normalizeAreaKey(key),
      area_label: key,
      boundary_status: 'No matching boundary',
      data_count: 0,
      denominator: null,
      rate: null,
      issue: 'Observation area did not match any boundary feature',
    });
  });

  result.summary.unmatchedDenominatorKeys.forEach(key => {
    rows.push({
      id: `denominator-${normalizeAreaKey(key)}`,
      area_key: normalizeAreaKey(key),
      area_label: key,
      boundary_status: 'No matching boundary',
      data_count: 0,
      denominator: null,
      rate: null,
      issue: 'Denominator area did not match any boundary feature',
    });
  });

  return rows;
}

export function classifyValues(
  values: number[],
  method: ClassificationMethod,
  classCount: number,
  manualBreaks: string = ''
): number[] {
  const cleanValues = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (cleanValues.length === 0) return [];

  const uniqueValues = Array.from(new Set(cleanValues));
  if (uniqueValues.length === 1) return [uniqueValues[0]];

  const bins = Math.max(2, Math.min(7, Math.floor(classCount)));

  if (method === 'manual') {
    const breaks = manualBreaks
      .split(',')
      .map(value => Number(value.trim()))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b);
    return Array.from(new Set(breaks));
  }

  if (method === 'quantile') {
    return Array.from({ length: bins - 1 }, (_, index) => {
      const position = ((index + 1) / bins) * (cleanValues.length - 1);
      return cleanValues[Math.round(position)];
    });
  }

  if (method === 'natural') {
    return jenksBreaks(cleanValues, bins).slice(1, -1);
  }

  const min = cleanValues[0];
  const max = cleanValues[cleanValues.length - 1];
  const step = (max - min) / bins;
  return Array.from({ length: bins - 1 }, (_, index) => min + step * (index + 1));
}

export function getClassIndex(value: number | null, breaks: number[]): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return i;
  }
  return breaks.length;
}

export function formatAreaValue(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return 'No data';
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function jenksBreaks(values: number[], classCount: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const k = Math.min(classCount, n);
  const lower = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));
  const variance = Array.from({ length: n + 1 }, () => Array(k + 1).fill(0));

  for (let i = 1; i <= k; i++) {
    lower[1][i] = 1;
    variance[1][i] = 0;
    for (let j = 2; j <= n; j++) variance[j][i] = Infinity;
  }

  for (let l = 2; l <= n; l++) {
    let sum = 0;
    let sumSquares = 0;
    let weight = 0;

    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const value = sorted[i3 - 1];
      sumSquares += value * value;
      sum += value;
      weight++;
      const varianceValue = sumSquares - (sum * sum) / weight;
      const i4 = i3 - 1;

      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (variance[l][j] >= varianceValue + variance[i4][j - 1]) {
            lower[l][j] = i3;
            variance[l][j] = varianceValue + variance[i4][j - 1];
          }
        }
      }
    }

    lower[l][1] = 1;
    variance[l][1] = sumSquares - (sum * sum) / weight;
  }

  const breaks = Array(k + 1).fill(0);
  breaks[k] = sorted[n - 1];
  breaks[0] = sorted[0];
  let count = k;
  let index = n;

  while (count > 1) {
    const id = lower[index][count] - 2;
    breaks[count - 1] = sorted[Math.max(0, id)];
    index = lower[index][count] - 1;
    count--;
  }

  return breaks;
}
