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
  /** True when this area's values were withheld for disclosure control. */
  suppressed?: boolean;
  key: string;
  label: string;
  /** Null once withheld. */
  count: number;
  denominator: number | null;
  rate: number | null;
  value: number | null;
  feature: GeoJsonFeature;
}

/**
 * Case count at or below which an area risks identifying individuals.
 *
 * Matches the threshold the Help Center gives: "Do not display individual
 * points if fewer than 5 cases exist in an area." The map reports areas under
 * it rather than suppressing them, so the analyst can see the signal during an
 * investigation and make an informed decision before publishing.
 */
export const SMALL_COUNT_THRESHOLD = 5;

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
  /** Areas with at least one case but fewer than SMALL_COUNT_THRESHOLD. */
  smallCountKeys: string[];
  /** Every record handed to the join, before any matching. */
  totalRecords: number;
  /** Records whose area matched a boundary, which is what the map shows. */
  matchedRecords: number;
  /** Records naming an area that no boundary has. */
  unmatchedRecords: number;
  /** Records with nothing in the area field. */
  blankAreaRecords: number;
  /** Record count behind each entry of `unmatchedDataKeys`; null once withheld. */
  unmatchedDataCounts: Record<string, number | null>;
  /** Boundary names carried by more than one polygon, with how many. */
  duplicateBoundaryLabels: Array<{ label: string; features: number }>;
  /** Areas with more than one row in the denominator table, with how many. */
  duplicateDenominatorLabels: Array<{ label: string; rows: number }>;
  /** Set by `suppressSmallCounts`: every area whose values were withheld. */
  withheldKeys?: string[];
  /** Of those, areas withheld only to protect another area's small count. */
  complementaryKeys?: string[];
  /** A withheld count can still be worked out from the total. */
  withheldRecoverable?: boolean;
}

export interface AreaJoinResult {
  areas: JoinedArea[];
  summary: AreaJoinSummary;
  metric?: AreaMetric;
}

/** What to do when the denominator table has several rows for one area. */
export type DuplicateDenominatorRule = 'block' | 'sum';

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
  /**
   * Defaults to 'block'. Adding the rows up is right for a table broken down
   * by age or sex and wrong for one row per year, and the two cannot be told
   * apart from here, so a rate is only calculated once the user has said.
   */
  duplicateDenominators?: DuplicateDenominatorRule;
}

export interface JoinReportRow extends CaseRecord {
  area_key: string;
  area_label: string;
  boundary_status: string;
  data_count: number | null;
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

export interface BoundaryValidation {
  /** Null when the file cannot be used; `error` then says why. */
  boundaries: GeoJsonFeatureCollection | null;
  error: string;
  /** Things the user should know about a file that was still accepted. */
  warnings: string[];
}

const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

/** Largest absolute x and y among a geometry's positions, without assuming it is well formed. */
function coordinateExtent(node: unknown, extent: { x: number; y: number; bad: boolean }, depth = 0): void {
  if (!Array.isArray(node) || depth > 6) {
    extent.bad = true;
    return;
  }
  if (typeof node[0] === 'number') {
    if (typeof node[1] !== 'number' || !Number.isFinite(node[0]) || !Number.isFinite(node[1])) {
      extent.bad = true;
      return;
    }
    extent.x = Math.max(extent.x, Math.abs(node[0]));
    extent.y = Math.max(extent.y, Math.abs(node[1]));
    return;
  }
  for (const child of node) coordinateExtent(child, extent, depth + 1);
}

/**
 * Check an uploaded boundary file before anything tries to draw it.
 *
 * `isFeatureCollection` only looked at the outer object. A file whose features
 * array held a null took the whole Maps module down to its error screen, and a
 * file in a projected coordinate system (UTM metres, say) loaded without
 * comment and drew a grey strip, because eastings and northings were read as
 * degrees. Both now produce a message instead.
 */
export function validateBoundaryGeoJson(value: unknown): BoundaryValidation {
  const fail = (error: string): BoundaryValidation => ({ boundaries: null, error, warnings: [] });

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail('This file is not GeoJSON. Upload a GeoJSON file of area boundaries.');
  }
  const root = value as Record<string, unknown>;

  let rawFeatures: unknown[];
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    rawFeatures = root.features;
  } else if (root.type === 'Feature') {
    rawFeatures = [root];
  } else if (root.type === 'Topology') {
    return fail('This is a TopoJSON file. Convert it to GeoJSON (for example with mapshaper.org) and upload that.');
  } else {
    return fail('This file is not a GeoJSON FeatureCollection.');
  }

  const warnings: string[] = [];
  const features: GeoJsonFeature[] = [];
  let malformed = 0;
  let notPolygons = 0;
  const extent = { x: 0, y: 0, bad: false };

  for (const raw of rawFeatures) {
    if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'Feature') {
      malformed++;
      continue;
    }
    const feature = raw as GeoJsonFeature;
    const geometry = feature.geometry as { type?: unknown; coordinates?: unknown } | null | undefined;
    if (!geometry || typeof geometry !== 'object' || typeof geometry.type !== 'string') {
      malformed++;
      continue;
    }
    if (!POLYGON_TYPES.has(geometry.type)) {
      notPolygons++;
      continue;
    }
    const featureExtent = { x: 0, y: 0, bad: false };
    coordinateExtent(geometry.coordinates, featureExtent);
    if (featureExtent.bad) {
      malformed++;
      continue;
    }
    extent.x = Math.max(extent.x, featureExtent.x);
    extent.y = Math.max(extent.y, featureExtent.y);

    const properties = feature.properties;
    features.push({
      ...feature,
      properties: properties && typeof properties === 'object' && !Array.isArray(properties) ? properties : {},
    });
  }

  if (features.length === 0) {
    return fail(
      notPolygons > 0
        ? 'This file has no area boundaries: its features are points or lines, not polygons.'
        : 'No usable boundary features were found in this file.'
    );
  }

  if (extent.x > 180 || extent.y > 90) {
    return fail(
      'These boundaries are not in latitude/longitude. The coordinates look projected (for example UTM metres). ' +
      'Reproject the layer to WGS84 (EPSG:4326) in your GIS software, export it as GeoJSON again, and upload that.'
    );
  }

  if (malformed > 0) {
    warnings.push(`${malformed} feature${malformed === 1 ? ' was' : 's were'} malformed and left out.`);
  }
  if (notPolygons > 0) {
    warnings.push(`${notPolygons} feature${notPolygons === 1 ? ' is' : 's are'} not a polygon and ${notPolygons === 1 ? 'was' : 'were'} left out.`);
  }

  return { boundaries: { type: 'FeatureCollection', features }, error: '', warnings };
}

export function normalizeAreaKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export function getGeoJsonPropertyKeys(boundaries: GeoJsonFeatureCollection | null): string[] {
  if (!boundaries) return [];
  const keys = new Set<string>();

  boundaries.features.slice(0, 25).forEach(feature => {
    Object.keys(feature?.properties ?? {}).forEach(key => keys.add(key));
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

/**
 * The boundary property to join on.
 *
 * The first property with a name-like key used to win, in alphabetical order.
 * For the two boundary sources field teams use most that is the wrong level:
 * a GADM district file offered NAME_1 (the province) and an OCHA file offered
 * ADM0_EN (the country), so every polygon shared one key.
 *
 * With the file in hand the choice can rest on its contents: prefer the
 * property whose values match the most area names in the data, then the one
 * that tells the polygons apart.
 *
 * @param dataKeys normalised area values from the dataset, when known
 */
export function suggestBoundaryKey(
  keys: string[],
  boundaries?: GeoJsonFeatureCollection | null,
  dataKeys?: Set<string>
): string {
  const namePatterns = [
    /^(id|code|name)$/i,
    /(admin|adm|district|province|county|region|state|village|ward|area|zone|name|code)/i,
  ];
  const looksNamed = (key: string) => namePatterns.some(pattern => pattern.test(key));

  if (!boundaries || boundaries.features.length === 0) {
    return keys.find(looksNamed) ?? keys[0] ?? '';
  }

  const total = boundaries.features.length;
  const scored = keys.map((key, index) => {
    const distinct = new Set<string>();
    let matches = 0;
    for (const feature of boundaries.features) {
      const value = normalizeAreaKey(feature.properties?.[key]);
      if (!value || distinct.has(value)) continue;
      distinct.add(value);
      if (dataKeys?.has(value)) matches++;
    }
    return { key, index, matches, uniqueness: distinct.size / total, named: looksNamed(key) };
  });

  scored.sort((a, b) =>
    b.matches - a.matches ||
    // A join key has to distinguish the polygons; a country or province name does not.
    Number(b.uniqueness >= 0.9) - Number(a.uniqueness >= 0.9) ||
    Number(b.named) - Number(a.named) ||
    // Names are what line lists hold; codes are a second choice.
    Number(/name|_en$|_fr$|_es$/i.test(b.key)) - Number(/name|_en$|_fr$|_es$/i.test(a.key)) ||
    b.uniqueness - a.uniqueness ||
    a.index - b.index
  );

  return scored[0]?.key ?? '';
}

/**
 * The dataset column and boundary property that agree best with each other.
 *
 * Returns nothing when no pair shares a single value, so that a guess is not
 * presented as a match.
 */
export function suggestJoinFields(
  columns: DataColumn[],
  records: CaseRecord[],
  boundaries: GeoJsonFeatureCollection
): { areaField: string; boundaryKey: string } | null {
  const keys = getGeoJsonPropertyKeys(boundaries);
  const boundaryValues = keys.map(key => {
    const values = new Set<string>();
    for (const feature of boundaries.features) {
      const value = normalizeAreaKey(feature.properties?.[key]);
      if (value) values.add(value);
    }
    return { key, values };
  });

  let best: { areaField: string; boundaryKey: string; matches: number } | null = null;
  const sample = records.slice(0, 5000);
  for (const column of columns) {
    if (column.type === 'date') continue;
    const dataValues = new Set<string>();
    for (const record of sample) {
      const value = normalizeAreaKey(record[column.key]);
      if (value) dataValues.add(value);
    }
    for (const { key, values } of boundaryValues) {
      let matches = 0;
      dataValues.forEach(value => {
        if (values.has(value)) matches++;
      });
      if (matches > 0 && (!best || matches > best.matches)) {
        best = { areaField: column.key, boundaryKey: key, matches };
      }
    }
  }

  return best ? { areaField: best.areaField, boundaryKey: best.boundaryKey } : null;
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
    duplicateDenominators = 'block',
  } = options;

  const dataCounts = new Map<string, { label: string; count: number }>();
  let blankAreaRecords = 0;
  records.forEach(record => {
    const rawValue = record[areaField];
    const key = normalizeAreaKey(rawValue);
    if (!key) {
      blankAreaRecords++;
      return;
    }

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
      denominatorRawCounts.set(key, (denominatorRawCounts.get(key) ?? 0) + 1);
    });
  }

  // Several denominator rows for one area were added together without a word.
  // A census table with one row per year then tripled the population and cut
  // the rate to a third. Unless the user has said the rows are parts of a
  // whole, such an area gets no denominator and so no rate.
  const hasDuplicateDenominator = (key: string) => (denominatorRawCounts.get(key) ?? 0) > 1;
  const usableDenominator = (key: string): number | null => {
    if (duplicateDenominators === 'block' && hasDuplicateDenominator(key)) return null;
    return denominatorValues.get(key)?.value ?? null;
  };

  const boundarySeen = new Map<string, number>();
  const boundaryLabels = new Map<string, string>();
  const boundaryKeys = new Set<string>();
  const areas = boundaries.features.map(feature => {
    const rawBoundaryValue = feature.properties?.[boundaryKey];
    const key = normalizeAreaKey(rawBoundaryValue);
    const label = String(rawBoundaryValue ?? (key || 'Unnamed area')).trim();
    if (key) {
      boundarySeen.set(key, (boundarySeen.get(key) ?? 0) + 1);
      if (!boundaryLabels.has(key)) boundaryLabels.set(key, label);
      boundaryKeys.add(key);
    }

    const count = dataCounts.get(key)?.count ?? 0;
    const denominator = usableDenominator(key);
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
  const unmatchedData = Array.from(dataCounts.entries()).filter(([key]) => !boundaryKeys.has(key));
  const unmatchedDataKeys = unmatchedData
    .map(([, value]) => value.label)
    .sort((a, b) => a.localeCompare(b));
  const unmatchedDataCounts: Record<string, number | null> = {};
  unmatchedData.forEach(([, value]) => {
    unmatchedDataCounts[value.label] = value.count;
  });
  const unmatchedRecords = unmatchedData.reduce((sum, [, value]) => sum + value.count, 0);
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

  // Areas holding a handful of cases can identify the people in them, which is
  // exactly what the Help Center tells users not to publish. Reported, not
  // suppressed: hiding them would also hide real signal mid-investigation.
  const smallCountKeys = areas
    .filter(area => area.count > 0 && area.count < SMALL_COUNT_THRESHOLD)
    .map(area => area.label)
    .sort((a, b) => a.localeCompare(b));

  return {
    areas,
    metric,
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
      smallCountKeys,
      totalRecords: records.length,
      matchedRecords: records.length - blankAreaRecords - unmatchedRecords,
      unmatchedRecords,
      blankAreaRecords,
      unmatchedDataCounts,
      duplicateBoundaryLabels: duplicateBoundaryKeys.map(key => ({
        label: boundaryLabels.get(key) ?? key,
        features: boundarySeen.get(key) ?? 0,
      })),
      duplicateDenominatorLabels: duplicateDenominatorKeys.map(key => ({
        label: denominatorValues.get(key)?.label ?? key,
        rows: denominatorRawCounts.get(key) ?? 0,
      })),
    },
  };
}

/**
 * Blank the values of areas holding fewer than SMALL_COUNT_THRESHOLD cases.
 *
 * Applied at the point of publication rather than during analysis: the counts
 * stay visible while someone is working, and are withheld once they choose to
 * suppress for sharing. Blanking rather than zeroing matters, because a zero
 * would be read as "no cases here" rather than "not disclosed".
 *
 * One blank among published counts is not hidden at all: it is the total less
 * everything shown. So when the withheld values could be worked out that way,
 * the smallest remaining area is withheld with them, which is the usual
 * complementary suppression. If there is no other area to withhold, the result
 * says the count is still recoverable so the user can be told.
 */
export function suppressSmallCounts(result: AreaJoinResult): AreaJoinResult {
  const threshold = SMALL_COUNT_THRESHOLD;

  // By key rather than by polygon: an area drawn as several polygons is one count.
  const countByKey = new Map<string, { label: string; count: number }>();
  result.areas.forEach(area => {
    if (area.count > 0 && !countByKey.has(area.key)) {
      countByKey.set(area.key, { label: area.label, count: area.count });
    }
  });

  const withheld = new Set<string>();
  countByKey.forEach((value, key) => {
    if (value.count < threshold) withheld.add(key);
  });
  const primaryCount = withheld.size;
  const complementary: string[] = [];
  let recoverable = false;

  if (primaryCount > 0) {
    const others = Array.from(countByKey.entries())
      .filter(([key]) => !withheld.has(key))
      .sort((a, b) => a[1].count - b[1].count || a[1].label.localeCompare(b[1].label));

    // The hidden total is the published total less the published counts. The
    // individual values follow from it when there is only one of them, or when
    // the total is the least or the most that many small counts could add up to.
    const determined = () => {
      const total = Array.from(withheld).reduce((sum, key) => sum + (countByKey.get(key)?.count ?? 0), 0);
      if (withheld.size === 1) return true;
      if (complementary.length === 0) {
        return total === primaryCount || total === primaryCount * (threshold - 1);
      }
      // One small count beside one larger area: a total of threshold + 1 can
      // only be 1 and threshold.
      return primaryCount === 1 && complementary.length === 1 && total === threshold + 1;
    };

    while (determined()) {
      const next = others.shift();
      if (!next) {
        recoverable = true;
        break;
      }
      withheld.add(next[0]);
      complementary.push(next[1].label);
    }
  }

  // The report lists areas with no boundary too, and a small count there is
  // no safer for being off the map.
  const unmatchedDataCounts: Record<string, number | null> = {};
  Object.entries(result.summary.unmatchedDataCounts ?? {}).forEach(([label, count]) => {
    unmatchedDataCounts[label] = count !== null && count < threshold ? null : count;
  });

  return {
    ...result,
    summary: {
      ...result.summary,
      unmatchedDataCounts,
      withheldKeys: Array.from(withheld)
        .map(key => countByKey.get(key)?.label ?? key)
        .sort((a, b) => a.localeCompare(b)),
      complementaryKeys: complementary.sort((a, b) => a.localeCompare(b)),
      withheldRecoverable: recoverable,
    },
    areas: result.areas.map(area =>
      area.count > 0 && withheld.has(area.key)
        ? { ...area, count: null as unknown as number, denominator: area.denominator, rate: null, value: null, suppressed: true }
        : { ...area, suppressed: false }
    ),
  };
}

/** How a withheld area is named in the legend, popups and report. */
export const WITHHELD_LABEL = 'Withheld (small counts)';

export function buildJoinReport(result: AreaJoinResult): JoinReportRow[] {
  // Older callers built results without a metric; a rate on any area means rates were asked for.
  const rateMode = result.metric
    ? result.metric === 'rate'
    : result.areas.some(area => area.rate !== null);
  const duplicateBoundaries = new Map(
    (result.summary.duplicateBoundaryLabels ?? []).map(entry => [normalizeAreaKey(entry.label), entry.features])
  );
  const duplicateDenominators = new Set(result.summary.duplicateDenominatorKeys ?? []);
  const suppressionOn = result.summary.withheldKeys !== undefined;

  const rows: JoinReportRow[] = result.areas.map(area => {
    const issues: string[] = [];
    if (area.suppressed) {
      issues.push('Withheld: fewer than 5, or withheld so that a small count cannot be worked out');
    } else {
      if (area.count === 0) issues.push('No observation records');
      // Only a rate map needs a denominator. In a count map this was reported
      // against every area that had cases.
      if (rateMode && area.count > 0 && area.rate === null) {
        issues.push(
          duplicateDenominators.has(area.key) && area.denominator === null
            ? 'More than one denominator row for this area; no rate calculated'
            : 'Missing or zero denominator'
        );
      }
    }
    const sharedBy = duplicateBoundaries.get(area.key);
    if (sharedBy) issues.push(`Boundary name shared by ${sharedBy} polygons; each shows the combined count`);

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
    // The count used to be written as 0, which read as "nothing lost" beside
    // an area that might hold most of the records.
    const count = result.summary.unmatchedDataCounts?.[key] ?? null;
    rows.push({
      id: `data-${normalizeAreaKey(key)}`,
      area_key: normalizeAreaKey(key),
      area_label: key,
      boundary_status: 'No matching boundary',
      data_count: count,
      denominator: null,
      rate: null,
      issue: 'Observation area did not match any boundary feature; these records are not on the map'
        + (suppressionOn && count === null ? '; count withheld (fewer than 5)' : ''),
    });
  });

  if ((result.summary.blankAreaRecords ?? 0) > 0) {
    const blank = result.summary.blankAreaRecords;
    rows.push({
      id: 'data-blank-area',
      area_key: '',
      area_label: '(blank)',
      boundary_status: 'No area recorded',
      data_count: suppressionOn && blank < SMALL_COUNT_THRESHOLD ? null : blank,
      denominator: null,
      rate: null,
      issue: 'Records with nothing in the area field; these records are not on the map',
    });
  }

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

/** Most classes a map is drawn with; the colour ramp has this many steps. */
export const MAX_CLASSES = 7;

/**
 * Read the manual breaks box.
 *
 * Commas separate values, but a comma is also the decimal mark for much of the
 * world, and "2,5, 7,5" was read as 2, 5, 7 and 5. A semicolon, or a comma
 * followed by a space, is taken as the separator when present, and the
 * remaining commas as decimal marks.
 */
export function parseManualBreaks(text: string): number[] {
  const separator = text.includes(';') ? /;/ : /,\s+/.test(text) && /\d,\d/.test(text) ? /,\s+/ : /,/;
  const decimalComma = separator.source !== ',';
  return text
    .split(separator)
    .map(part => part.trim())
    .filter(part => part !== '')
    .map(part => Number(decimalComma ? part.replace(',', '.') : part))
    .filter(value => Number.isFinite(value));
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
  // A single unique value forms one class with no breaks
  if (uniqueValues.length === 1) return [];

  const bins = Math.max(2, Math.min(MAX_CLASSES, Math.floor(classCount)));
  const max = cleanValues[cleanValues.length - 1];

  let breaks: number[];

  if (method === 'manual') {
    // More breaks than colours would give several classes the same colour.
    return Array.from(new Set(parseManualBreaks(manualBreaks)))
      .sort((a, b) => a - b)
      .slice(0, MAX_CLASSES - 1);
  } else if (method === 'quantile') {
    breaks = Array.from({ length: bins - 1 }, (_, index) => {
      const position = ((index + 1) / bins) * (cleanValues.length - 1);
      return cleanValues[Math.round(position)];
    });
  } else if (method === 'natural') {
    breaks = jenksBreaks(cleanValues, bins).slice(1, -1);
  } else {
    const min = cleanValues[0];
    const step = (max - min) / bins;
    breaks = Array.from({ length: bins - 1 }, (_, index) => min + step * (index + 1));
  }

  // Deduplicate breaks (quantile/natural can repeat breaks on skewed data).
  // A break at the maximum is dropped: nothing lies above it, so it only adds
  // an empty class to the legend.
  return Array.from(new Set(breaks)).filter(value => value < max).sort((a, b) => a - b);
}

export function getClassIndex(value: number | null, breaks: number[]): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  for (let i = 0; i < breaks.length; i++) {
    if (value <= breaks[i]) return i;
  }
  return breaks.length;
}

// ColorBrewer "Blues", without its two palest steps. Those were close to
// white, and the lowest class could not be told from an area with no data.
const CHOROPLETH_RAMP = ['#C6DBEF', '#9ECAE1', '#6BAED6', '#4292C6', '#2171B5', '#08519C', '#08306B'];

/**
 * Fill colour for a class, spread across the whole ramp.
 *
 * Three classes used to take the three palest colours and never reach a dark
 * one. The ends of the ramp are now always the lowest and the highest class.
 */
export function classColor(classIndex: number, classTotal: number): string {
  const last = CHOROPLETH_RAMP.length - 1;
  // One class means every area has the same value; a dark fill would suggest a high one.
  if (classTotal <= 1) return CHOROPLETH_RAMP[1];
  const clamped = Math.min(Math.max(classIndex, 0), classTotal - 1);
  return CHOROPLETH_RAMP[Math.round((clamped * last) / Math.min(classTotal - 1, last))] ?? CHOROPLETH_RAMP[last];
}

export interface LegendClass {
  classIndex: number;
  label: string;
}

/**
 * Legend rows whose labels say which values each class holds.
 *
 * A value equal to a break belongs to the class below it. The labels used to
 * repeat the break on both sides ("0 - 1", "1 - 2"), so the row a reader would
 * pick for an area of 1 was not the row whose colour it had. Whole numbers are
 * now labelled by the values actually in the class ("1", "2", "3–5"), and
 * other values with an explicit "more than".
 */
export function buildLegendClasses(values: number[], breaks: number[]): LegendClass[] {
  const clean = values.filter(value => Number.isFinite(value));
  if (clean.length === 0) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (breaks.length === 0) {
    return [{ classIndex: 0, label: min === max ? formatAreaValue(min) : `${formatAreaValue(min)} – ${formatAreaValue(max)}` }];
  }

  const integers = clean.every(Number.isInteger);
  const rows: LegendClass[] = [];

  for (let i = 0; i <= breaks.length; i++) {
    const lower = i === 0 ? null : breaks[i - 1];
    const upper = i === breaks.length ? null : breaks[i];

    if (integers) {
      if (lower === null) {
        const to = Math.floor(upper as number);
        rows.push({
          classIndex: i,
          label: min > to ? `${to} or fewer` : min === to ? String(to) : `${min}–${to}`,
        });
        continue;
      }
      const from = Math.floor(lower) + 1;
      const to = upper === null ? max : Math.floor(upper);
      if (upper === null && from > max) {
        rows.push({ classIndex: i, label: `${from} or more` });
      } else if (from <= to) {
        rows.push({ classIndex: i, label: from === to ? String(from) : `${from}–${to}` });
      }
      continue;
    }

    if (lower === null) {
      rows.push({
        classIndex: i,
        label: min < (upper as number)
          ? `${formatAreaValue(min)} – ${formatAreaValue(upper)}`
          : `${formatAreaValue(upper)} or less`,
      });
    } else if (upper === null) {
      rows.push({
        classIndex: i,
        label: max > lower
          ? `> ${formatAreaValue(lower)} – ${formatAreaValue(max)}`
          : `> ${formatAreaValue(lower)}`,
      });
    } else {
      rows.push({ classIndex: i, label: `> ${formatAreaValue(lower)} – ${formatAreaValue(upper)}` });
    }
  }

  return rows;
}

export function formatAreaValue(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return 'No data';
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// ---------------------------------------------------------------------------
// Boundaries for the session
// ---------------------------------------------------------------------------

interface StoredBoundaries {
  boundaries: GeoJsonFeatureCollection;
  fileName: string;
}

// The three map modes replace one another, so leaving the Area Map for the
// Spot Map unmounted it and discarded the uploaded boundaries. They are too
// large for browser storage, so they are kept here for as long as the page is
// open, per dataset.
const sessionBoundaries = new Map<string, StoredBoundaries>();

export function rememberBoundaries(datasetId: string, stored: StoredBoundaries | null): void {
  if (stored) sessionBoundaries.set(datasetId, stored);
  else sessionBoundaries.delete(datasetId);
}

export function recallBoundaries(datasetId: string): StoredBoundaries | null {
  return sessionBoundaries.get(datasetId) ?? null;
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
