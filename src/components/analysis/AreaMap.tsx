import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { GeoJSON, MapContainer, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import { geoJSON as createGeoJSONLayer } from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { Dataset } from '../../types/analysis';
import { AdvancedOptions, ExportIcons, HelpPanel, ResultsActions, TabHeader } from '../shared';
import { exportToCSV } from '../../utils/csvParser';
import { useLocale } from '../../contexts/LocaleContext';
import { categoryValue, collectCategoryValues } from '../../utils/recordFilter';
import { basemaps, MAP_MAX_ZOOM } from '../../utils/basemaps';
import type { BasemapId } from '../../utils/basemaps';
import { canvasToPngBlob, captureMapCanvas, downloadBlob, downloadText } from '../../utils/mapExport';
import {
  buildAreaJoin,
  buildJoinReport,
  buildLegendClasses,
  classColor,
  SMALL_COUNT_THRESHOLD,
  suppressSmallCounts,
  classifyValues,
  formatAreaValue,
  getClassIndex,
  getGeoJsonPropertyKeys,
  joinReportColumns,
  normalizeAreaKey,
  recallBoundaries,
  rememberBoundaries,
  suggestAreaField,
  suggestBoundaryKey,
  suggestJoinFields,
  validateBoundaryGeoJson,
  WITHHELD_LABEL,
} from '../../utils/areaMap';
import type {
  AreaMetric,
  ClassificationMethod,
  DuplicateDenominatorRule,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  JoinedArea,
} from '../../utils/areaMap';

interface AreaMapProps {
  dataset: Dataset;
  datasets: Dataset[];
}

type BaseMap = Exclude<BasemapId, 'satellite'> | 'none';
type ExportBaseMap = 'current' | 'quiet' | 'none';

interface SampleBoundary {
  label: string;
  fileName: string;
  url: string;
  boundaryKey: string;
  preferredAreaField: string;
}

const rateMultipliers = [1000, 10000, 100000];

const sampleBoundaries: SampleBoundary[] = [
  {
    label: 'Toledo area neighborhoods',
    fileName: 'toledo-area-neighborhoods.geojson',
    url: 'sample-boundaries/toledo-area-neighborhoods.geojson',
    boundaryKey: 'name',
    preferredAreaField: 'neighborhood',
  },
];

// Areas with no value, and areas whose value is withheld, are different
// statements and are drawn differently: grey for nothing to show, a dashed
// sand fill for something deliberately not shown.
const NO_DATA_FILL = '#D1D5DB';
const WITHHELD_FILL = '#E7D8B1';

function FitGeoJsonBounds({ boundaries }: { boundaries: GeoJsonFeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (!boundaries) return;
    const layer = createGeoJSONLayer(boundaries as unknown as FeatureCollection);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [boundaries, map]);

  return null;
}

function getAreaKey(feature: GeoJsonFeature | undefined, boundaryKey: string): string {
  return normalizeAreaKey(feature?.properties?.[boundaryKey]);
}

function makeAreaProperties(area: JoinedArea, metric: AreaMetric, rateMultiplier: number) {
  // One tag for every withheld area. Saying which were withheld for their own
  // small count and which to protect a neighbour would hand back the answer.
  return {
    ...area.feature.properties,
    linelist_area_key: area.key,
    linelist_count: area.count,
    linelist_denominator: area.denominator,
    linelist_rate: area.rate,
    linelist_metric: metric,
    linelist_rate_multiplier: metric === 'rate' ? rateMultiplier : null,
    linelist_mapped_value: area.value,
    linelist_disclosure: area.suppressed ? 'withheld_small_count' : 'as_observed',
  };
}

function getPublicAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

export function AreaMap({ dataset, datasets }: AreaMapProps) {
  const { config: localeConfig } = useLocale();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persistenceKey = `epikit_areamap_${dataset.id}`;
  const [saved] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem(persistenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Boundaries survive a switch to another map tab and back; see rememberBoundaries.
  const [recalled] = useState(() => recallBoundaries(dataset.id));
  const [boundaries, setBoundaries] = useState<GeoJsonFeatureCollection | null>(recalled?.boundaries ?? null);
  const [boundaryFileName, setBoundaryFileName] = useState(recalled?.fileName ?? '');
  const [boundaryError, setBoundaryError] = useState('');
  const [boundaryWarnings, setBoundaryWarnings] = useState<string[]>([]);

  // Discard persisted column keys that no longer exist in the relevant dataset
  const validSavedColumn = (value: unknown, columns: Dataset['columns']): string => {
    const key = typeof value === 'string' ? value : '';
    return key && columns.some(col => col.key === key) ? key : '';
  };
  const initialDenominatorColumns = datasets.find(item => item.id === saved.denominatorDatasetId)?.columns ?? [];

  const [boundaryKey, setBoundaryKey] = useState<string>(() => (saved.boundaryKey as string) || '');
  const [areaField, setAreaField] = useState<string>(() => validSavedColumn(saved.areaField, dataset.columns) || suggestAreaField(dataset.columns));
  const [metric, setMetric] = useState<AreaMetric>(() => (saved.metric as AreaMetric) || 'count');
  const [denominatorDatasetId, setDenominatorDatasetId] = useState<string>(() => {
    const id = typeof saved.denominatorDatasetId === 'string' ? saved.denominatorDatasetId : '';
    return datasets.some(item => item.id === id) ? id : '';
  });
  const [denominatorKey, setDenominatorKey] = useState<string>(() => validSavedColumn(saved.denominatorKey, initialDenominatorColumns));
  const [denominatorValue, setDenominatorValue] = useState<string>(() => validSavedColumn(saved.denominatorValue, initialDenominatorColumns));
  const [rateMultiplier, setRateMultiplier] = useState<number>(() => (saved.rateMultiplier as number) || 100000);
  const [duplicateDenominators, setDuplicateDenominators] = useState<DuplicateDenominatorRule>(() =>
    saved.duplicateDenominators === 'sum' ? 'sum' : 'block'
  );
  // The same record filter the spot map has, so a count or a rate can be
  // limited to cases. Without it every row was counted, non-cases included.
  const [filterBy, setFilterBy] = useState<string>(() => validSavedColumn(saved.filterBy, dataset.columns));
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    const values = saved.selectedFilterValues;
    return Array.isArray(values) ? new Set(values.filter((value): value is string => typeof value === 'string')) : new Set();
  });
  // Off by default: hiding small counts mid-investigation would hide real
  // signal. Turned on when a map is being prepared to share.
  const [suppressSmall, setSuppressSmall] = useState<boolean>(() => saved.suppressSmall === true);
  const [classificationMethod, setClassificationMethod] = useState<ClassificationMethod>(() => (saved.classificationMethod as ClassificationMethod) || 'quantile');
  const [classCount, setClassCount] = useState<number>(() => (saved.classCount as number) || 5);
  const [manualBreaks, setManualBreaks] = useState<string>(() => (saved.manualBreaks as string) || '');
  const [baseMap, setBaseMap] = useState<BaseMap>(() => {
    const value = saved.baseMap;
    return value === 'street' || value === 'quiet' || value === 'topo' || value === 'none' ? value : 'quiet';
  });
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [exportBaseMap, setExportBaseMap] = useState<ExportBaseMap>(() => (saved.exportBaseMap as ExportBaseMap) || 'quiet');
  const [mapTitle, setMapTitle] = useState<string>(() => (saved.mapTitle as string) || '');
  const [mapCaption, setMapCaption] = useState<string>(() => (saved.mapCaption as string) || '');
  const [showLegend, setShowLegend] = useState<boolean>(() => saved.showLegend !== undefined ? saved.showLegend as boolean : true);
  const [exportStatus, setExportStatus] = useState('');
  const [exportError, setExportError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const propertyKeys = useMemo(() => getGeoJsonPropertyKeys(boundaries), [boundaries]);
  const denominatorDataset = datasets.find(item => item.id === denominatorDatasetId) ?? null;
  const denominatorNumericColumns = useMemo(() => (
    denominatorDataset?.columns.filter(col => col.type === 'number') ?? []
  ), [denominatorDataset]);

  useEffect(() => {
    try {
      localStorage.setItem(persistenceKey, JSON.stringify({
        boundaryKey,
        areaField,
        metric,
        denominatorDatasetId,
        denominatorKey,
        denominatorValue,
        rateMultiplier,
        duplicateDenominators,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
        suppressSmall,
        classificationMethod,
        classCount,
        manualBreaks,
        baseMap,
        exportBaseMap,
        mapTitle,
        mapCaption,
        showLegend,
      }));
    } catch (error) {
      console.error('Failed to save area map settings:', error);
    }
  }, [
    persistenceKey,
    boundaryKey,
    areaField,
    metric,
    denominatorDatasetId,
    denominatorKey,
    denominatorValue,
    rateMultiplier,
    duplicateDenominators,
    filterBy,
    selectedFilterValues,
    suppressSmall,
    classificationMethod,
    classCount,
    manualBreaks,
    baseMap,
    exportBaseMap,
    mapTitle,
    mapCaption,
    showLegend,
  ]);

  useEffect(() => {
    if (!boundaryKey && propertyKeys.length > 0) {
      setBoundaryKey(suggestBoundaryKey(propertyKeys, boundaries));
    }
  }, [boundaryKey, propertyKeys, boundaries]);

  useEffect(() => {
    if (!areaField && dataset.columns.length > 0) {
      setAreaField(suggestAreaField(dataset.columns));
    }
  }, [areaField, dataset.columns]);

  useEffect(() => {
    if (!denominatorDataset) return;
    if (!denominatorKey) {
      setDenominatorKey(suggestAreaField(denominatorDataset.columns));
    }
    if (!denominatorValue && denominatorNumericColumns.length > 0) {
      const populationColumn = denominatorNumericColumns.find(col => {
        const name = `${col.key} ${col.label}`.toLowerCase();
        return name.includes('population') || name.includes('pop') || name.includes('denominator');
      });
      setDenominatorValue((populationColumn ?? denominatorNumericColumns[0]).key);
    }
  }, [denominatorDataset, denominatorKey, denominatorNumericColumns, denominatorValue]);

  const filterValues = useMemo(() => (
    filterBy ? collectCategoryValues(dataset.records, filterBy) : []
  ), [dataset.records, filterBy]);

  const filteredRecords = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) return dataset.records;
    return dataset.records.filter(record => selectedFilterValues.has(categoryValue(record[filterBy])));
  }, [dataset.records, filterBy, selectedFilterValues]);

  const joinResult = useMemo(() => {
    if (!boundaries || !boundaryKey || !areaField) return null;

    return buildAreaJoin({
      records: filteredRecords,
      areaField,
      boundaries,
      boundaryKey,
      metric,
      denominatorDataset,
      denominatorKey,
      denominatorValue,
      rateMultiplier,
      duplicateDenominators,
    });
  }, [
    areaField,
    boundaries,
    boundaryKey,
    filteredRecords,
    denominatorDataset,
    denominatorKey,
    denominatorValue,
    duplicateDenominators,
    metric,
    rateMultiplier,
  ]);

  // Applied once, here, so the map, legend, classification breaks and every
  // export all read the same withheld values. Suppressing only at export would
  // leave the on-screen map disclosing what the file withholds.
  const displayResult = useMemo(
    () => (joinResult && suppressSmall ? suppressSmallCounts(joinResult) : joinResult),
    [joinResult, suppressSmall]
  );

  const areaByKey = useMemo(() => {
    const lookup = new Map<string, JoinedArea>();
    displayResult?.areas.forEach(area => lookup.set(area.key, area));
    return lookup;
  }, [displayResult]);

  const mappedValues = useMemo(() => (
    displayResult?.areas
      .map(area => area.value)
      .filter((value): value is number => value !== null && Number.isFinite(value)) ?? []
  ), [displayResult]);

  const breaks = useMemo(() => (
    classifyValues(mappedValues, classificationMethod, classCount, manualBreaks)
  ), [mappedValues, classificationMethod, classCount, manualBreaks]);

  const joinedFeatureCollection = useMemo(() => {
    if (!displayResult) return null;
    return {
      type: 'FeatureCollection',
      features: displayResult.areas.map(area => ({
        ...area.feature,
        properties: makeAreaProperties(area, metric, rateMultiplier),
      })),
    };
  }, [displayResult, metric, rateMultiplier]);

  // Covers every joined value so the GeoJSON layer (and its popup contents)
  // remounts whenever counts, denominators, or rates change
  const joinVersion = useMemo(() => (
    displayResult?.areas
      .map(area => `${area.key}:${area.count}:${area.denominator ?? ''}:${area.rate ?? ''}:${area.suppressed ? 'w' : ''}`)
      .join('|') ?? ''
  ), [displayResult]);
  const activeBaseMap: BaseMap = isExporting && exportBaseMap !== 'current' ? exportBaseMap : baseMap;

  // Take a validated set of boundaries and choose the fields to join on.
  const adoptBoundaries = (
    accepted: GeoJsonFeatureCollection,
    fileName: string,
    warnings: string[],
    preferred?: { boundaryKey: string; areaField: string }
  ) => {
    setBoundaries(accepted);
    setBoundaryFileName(fileName);
    setBoundaryError('');
    setBoundaryWarnings(warnings);
    rememberBoundaries(dataset.id, { boundaries: accepted, fileName });

    const keys = getGeoJsonPropertyKeys(accepted);
    if (preferred && keys.includes(preferred.boundaryKey) && dataset.columns.some(col => col.key === preferred.areaField)) {
      setBoundaryKey(preferred.boundaryKey);
      setAreaField(preferred.areaField);
      return;
    }

    // Prefer the pair of fields whose values actually agree. Failing that,
    // keep the area field and pick the boundary property that best
    // distinguishes the polygons.
    const pair = suggestJoinFields(dataset.columns, dataset.records, accepted);
    if (pair) {
      setAreaField(pair.areaField);
      setBoundaryKey(pair.boundaryKey);
      return;
    }
    setBoundaryKey(suggestBoundaryKey(keys, accepted));
  };

  const handleBoundaryFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const validation = validateBoundaryGeoJson(JSON.parse(await file.text()) as unknown);
      if (!validation.boundaries) {
        setBoundaryError(validation.error);
        return;
      }
      adoptBoundaries(validation.boundaries, file.name, validation.warnings);
    } catch {
      setBoundaryError('The boundary file could not be read. Upload a valid GeoJSON file.');
    } finally {
      event.target.value = '';
    }
  };

  const loadSampleBoundary = async (sample: SampleBoundary) => {
    try {
      const response = await fetch(getPublicAssetUrl(sample.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const validation = validateBoundaryGeoJson(await response.json() as unknown);
      if (!validation.boundaries) {
        setBoundaryError(validation.error);
        return;
      }
      adoptBoundaries(validation.boundaries, sample.fileName, validation.warnings, {
        boundaryKey: sample.boundaryKey,
        areaField: sample.preferredAreaField,
      });
    } catch (error) {
      console.error('Failed to load sample boundary:', error);
      setBoundaryError('The sample boundary could not be loaded.');
    }
  };

  const classTotal = breaks.length + 1;

  const getFillColor = (value: number | null): string => {
    const classIndex = getClassIndex(value, breaks);
    if (classIndex === null) return NO_DATA_FILL;
    return classColor(classIndex, classTotal);
  };

  const styleFeature = (feature: GeoJsonFeature | undefined) => {
    const area = areaByKey.get(getAreaKey(feature, boundaryKey));
    if (area?.suppressed) {
      return {
        fillColor: WITHHELD_FILL,
        fillOpacity: 0.75,
        color: '#475569',
        weight: 1.5,
        opacity: 0.9,
        dashArray: '4 3',
      };
    }
    return {
      fillColor: getFillColor(area?.value ?? null),
      fillOpacity: area?.value === null || area === undefined ? 0.55 : 0.8,
      color: '#475569',
      weight: 1,
      opacity: 0.9,
    };
  };

  const bindFeaturePopup = (feature: GeoJsonFeature, layer: { bindPopup: (content: string) => void }) => {
    const area = areaByKey.get(getAreaKey(feature, boundaryKey));
    const title = area?.label || String(feature.properties?.[boundaryKey] ?? 'Area');
    // A withheld count used to be shown here as "Count: 0", which is a
    // different and false statement.
    const countLabel = area?.suppressed
      ? `withheld (fewer than ${SMALL_COUNT_THRESHOLD}, or hidden so that a small count cannot be worked out)`
      : String(area?.count ?? 0);
    const rateLabel = metric === 'rate'
      ? `<div><strong>Rate:</strong> ${area?.suppressed ? 'withheld' : formatAreaValue(area?.rate ?? null)} per ${rateMultiplier.toLocaleString()}</div>`
      : '';
    const severalRows = area !== undefined && (joinResult?.summary.duplicateDenominatorKeys.includes(area.key) ?? false);
    const denominatorLabel = metric === 'rate'
      ? `<div><strong>Denominator:</strong> ${area?.denominator?.toLocaleString() ?? (severalRows ? 'several rows for this area, not used' : 'No match')}</div>`
      : '';
    layer.bindPopup(`
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(title)}</div>
        <div><strong>Count:</strong> ${countLabel}</div>
        ${denominatorLabel}
        ${rateLabel}
      </div>
    `);
  };

  const exportMap = async () => {
    const exportElement = mapContainerRef.current;
    if (!exportElement) return;

    setIsExporting(true);
    setExportStatus('Preparing area map export...');
    setExportError('');
    try {
      // captureMapCanvas lets React swap in the export base map and waits for
      // its tiles before drawing.
      const canvas = await captureMapCanvas(exportElement);
      downloadBlob(await canvasToPngBlob(canvas), `area-map-${new Date().toISOString().split('T')[0]}.png`);
      setExportStatus('PNG downloaded.');
      window.setTimeout(() => setExportStatus(''), 4000);
    } catch (error) {
      console.error('Failed to export area map:', error);
      setExportStatus('');
      setExportError('PNG export did not finish. Try the quiet base map or export the joined GeoJSON for a GIS tool.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportJoinReport = () => {
    if (!displayResult) return;
    try {
      const csv = exportToCSV(joinReportColumns, buildJoinReport(displayResult), { localeConfig });
      downloadText(csv, `area_map_join_report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    } catch (error) {
      console.error('Failed to export join report:', error);
      setExportError('The join report could not be created.');
    }
  };

  const exportJoinedGeoJSON = () => {
    if (!joinedFeatureCollection) return;
    try {
      downloadText(
        JSON.stringify(joinedFeatureCollection, null, 2),
        `area_map_joined_${new Date().toISOString().split('T')[0]}.geojson`,
        'application/geo+json'
      );
      setExportStatus('GeoJSON downloaded.');
      setExportError('');
      window.setTimeout(() => setExportStatus(''), 4000);
    } catch (error) {
      console.error('Failed to export GeoJSON:', error);
      setExportStatus('');
      setExportError('The GeoJSON file could not be created.');
    }
  };

  const legendItems = useMemo(() => (
    buildLegendClasses(mappedValues, breaks).map(row => ({
      label: row.label,
      color: classColor(row.classIndex, breaks.length + 1),
    }))
  ), [breaks, mappedValues]);

  const hasWithheldAreas = displayResult?.areas.some(area => area.suppressed) ?? false;
  const hasNoDataAreas = displayResult?.areas.some(area => !area.suppressed && area.value === null) ?? false;
  const summary = joinResult?.summary;
  const suppression = suppressSmall ? displayResult?.summary : undefined;

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <div className="w-full lg:w-80 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto max-h-[45vh] lg:max-h-none">
        <TabHeader
          title="Area Map"
          description="Join observation counts and optional denominator data to uploaded boundary polygons."
        />

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Boundary GeoJSON</label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-left"
            >
              {boundaryFileName || 'Upload boundary file...'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={handleBoundaryFile}
              className="hidden"
            />
            {boundaryError && <p className="text-xs text-red-700 mt-1">{boundaryError}</p>}
            {boundaryWarnings.map(warning => (
              <p key={warning} className="text-xs text-amber-700 mt-1">{warning}</p>
            ))}
            <div className="mt-2 space-y-2">
              {sampleBoundaries.map(sample => (
                <button
                  key={sample.fileName}
                  onClick={() => loadSampleBoundary(sample)}
                  className="w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-left"
                >
                  Use sample: {sample.label}
                </button>
              ))}
            </div>
          </div>

          {propertyKeys.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Boundary Area Field</label>
              <select
                value={boundaryKey}
                onChange={(event) => setBoundaryKey(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {propertyKeys.map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observation Area Field</label>
            <select
              value={areaField}
              onChange={(event) => setAreaField(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter Records</label>
            <select
              value={filterBy}
              onChange={(event) => {
                setFilterBy(event.target.value);
                setSelectedFilterValues(new Set());
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None (count every record)</option>
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            {filterBy && filterValues.length > 0 && (
              <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Count only:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedFilterValues(new Set(filterValues))}
                      className="text-xs text-gray-600 hover:text-gray-900"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedFilterValues(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {filterValues.map(value => (
                    <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFilterValues.has(value)}
                        onChange={(event) => {
                          const next = new Set(selectedFilterValues);
                          if (event.target.checked) next.add(value);
                          else next.delete(value);
                          setSelectedFilterValues(next);
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-gray-700 truncate flex-1">{value}</span>
                      <span className="text-gray-400 text-xs">
                        ({dataset.records.filter(record => categoryValue(record[filterBy]) === value).length})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              {filteredRecords.length === dataset.records.length
                ? `All ${dataset.records.length} records are counted. To map cases only, filter on the case status variable.`
                : `${filteredRecords.length} of ${dataset.records.length} records are counted.`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Map Value</label>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as AreaMetric)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="count">Record count by area</option>
              <option value="rate">Rate using denominator dataset</option>
            </select>
          </div>

          {metric === 'rate' && (
            <div className="space-y-3 bg-white border border-gray-200 rounded-lg p-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Denominator Dataset</label>
                <select
                  value={denominatorDatasetId}
                  onChange={(event) => {
                    setDenominatorDatasetId(event.target.value);
                    setDenominatorKey('');
                    setDenominatorValue('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Select imported census/denominator table...</option>
                  {datasets.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {denominatorDataset && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Denominator Area Field</label>
                    <select
                      value={denominatorKey}
                      onChange={(event) => setDenominatorKey(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {denominatorDataset.columns.map(col => (
                        <option key={col.key} value={col.key}>{col.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Population/Denominator Field</label>
                    <select
                      value={denominatorValue}
                      onChange={(event) => setDenominatorValue(event.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {denominatorNumericColumns.map(col => (
                        <option key={col.key} value={col.key}>{col.label}</option>
                      ))}
                    </select>
                    {denominatorNumericColumns.length === 0 && (
                      <p className="text-xs text-amber-700 mt-1">No numeric denominator fields were detected in this dataset.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Rate Multiplier</label>
                    <select
                      value={rateMultiplier}
                      onChange={(event) => setRateMultiplier(Number(event.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      {rateMultipliers.map(multiplier => (
                        <option key={multiplier} value={multiplier}>per {multiplier.toLocaleString()}</option>
                      ))}
                    </select>
                  </div>

                  {summary && summary.duplicateDenominatorLabels.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Areas with several denominator rows</label>
                      <select
                        value={duplicateDenominators}
                        onChange={(event) => setDuplicateDenominators(event.target.value as DuplicateDenominatorRule)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      >
                        <option value="block">Do not calculate a rate</option>
                        <option value="sum">Add the rows together</option>
                      </select>
                      <p className="text-xs text-amber-700 mt-1">
                        {summary.duplicateDenominatorLabels.length} area{summary.duplicateDenominatorLabels.length === 1 ? ' has' : 's have'} more than one row in the denominator table (for example {summary.duplicateDenominatorLabels[0].label}, {summary.duplicateDenominatorLabels[0].rows} rows). Add them together only if the rows are parts of one population, such as age groups. If they are different years, keep one year in the table instead.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {joinResult && summary && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-800">Join QA</h3>
                <button
                  onClick={exportJoinReport}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Export report
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-gray-500">Records on the map</span>
                <span className="text-right font-medium">{summary.matchedRecords} of {summary.totalRecords}</span>
                <span className="text-gray-500">Records with no matching boundary</span>
                <span className="text-right font-medium">{summary.unmatchedRecords}</span>
                <span className="text-gray-500">Records with no area recorded</span>
                <span className="text-right font-medium">{summary.blankAreaRecords}</span>
                <span className="text-gray-500">Boundary areas</span>
                <span className="text-right font-medium">{summary.boundaryCount}</span>
                <span className="text-gray-500">Matched areas</span>
                <span className="text-right font-medium">{summary.matchedBoundaryCount}</span>
                <span className="text-gray-500">Unmatched data areas</span>
                <span className="text-right font-medium">{summary.unmatchedDataKeys.length}</span>
                <span className="text-gray-500">Unmatched boundaries</span>
                <span className="text-right font-medium">{summary.unmatchedBoundaryKeys.length}</span>
                <span className="text-gray-500">Boundary names used more than once</span>
                <span className="text-right font-medium">{summary.duplicateBoundaryLabels.length}</span>
                {metric === 'rate' && (
                  <>
                    <span className="text-gray-500">Missing denominators</span>
                    <span className="text-right font-medium">{summary.missingDenominatorKeys.length}</span>
                    <span className="text-gray-500">Unmatched denominator areas</span>
                    <span className="text-right font-medium">{summary.unmatchedDenominatorKeys.length}</span>
                    <span className="text-gray-500">Areas with several denominator rows</span>
                    <span className="text-right font-medium">{summary.duplicateDenominatorLabels.length}</span>
                  </>
                )}
                {summary.smallCountKeys.length > 0 && (
                  <>
                    <span className="text-gray-500">Areas with 1 to {SMALL_COUNT_THRESHOLD - 1} records</span>
                    <span className="text-right font-medium">{summary.smallCountKeys.length}</span>
                  </>
                )}
              </div>
              {summary.unmatchedRecords + summary.blankAreaRecords > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {summary.unmatchedRecords + summary.blankAreaRecords} of {summary.totalRecords} records are not on the map
                  {summary.unmatchedDataKeys.length > 0
                    ? `, including area names with no boundary: ${summary.unmatchedDataKeys.slice(0, 4).join(', ')}${summary.unmatchedDataKeys.length > 4 ? ', ...' : ''}.`
                    : '.'}
                </p>
              )}
              {summary.duplicateBoundaryLabels.length > 0 && (
                <p className="text-xs text-amber-700 mt-2">
                  {summary.duplicateBoundaryLabels.length} boundary name{summary.duplicateBoundaryLabels.length === 1 ? ' is' : 's are'} shared by more than one polygon ({summary.duplicateBoundaryLabels.slice(0, 3).map(entry => `${entry.label} ×${entry.features}`).join(', ')}{summary.duplicateBoundaryLabels.length > 3 ? ', ...' : ''}). Every polygon with that name shows the combined count. If these are different places, join on a unique code or a finer boundary field.
                </p>
              )}
              {summary.smallCountKeys.length > 0 && (
                <label className="flex items-start gap-2 mt-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suppressSmall}
                    onChange={e => setSuppressSmall(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <span>
                    Withhold areas under {SMALL_COUNT_THRESHOLD} when sharing this map.
                    Their values are blanked on the map, in the legend and in every export,
                    and marked as withheld rather than shown as zero.
                  </span>
                </label>
              )}
              {suppression?.complementaryKeys && suppression.complementaryKeys.length > 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  {suppression.complementaryKeys.length === 1 ? 'One larger area is' : `${suppression.complementaryKeys.length} larger areas are`} also withheld ({suppression.complementaryKeys.join(', ')}). Otherwise the hidden count could be worked out by subtracting the published counts from the total.
                </p>
              )}
              {suppression?.withheldRecoverable && (
                <p className="text-xs text-red-700 mt-2">
                  The withheld count can still be worked out: there is no other area to withhold alongside it, so it equals the total minus the counts shown. Do not publish the total with this map, or combine areas first.
                </p>
              )}
              {summary.smallCountKeys.length > 0 && !suppressSmall && (
                <p className="text-xs text-amber-700 mt-2">
                  {summary.smallCountKeys.length} area
                  {summary.smallCountKeys.length === 1 ? ' holds' : 's hold'} fewer than{' '}
                  {SMALL_COUNT_THRESHOLD} records. Small counts combined with geography can identify
                  individuals, so review these before publishing or sharing this map or its exports.
                </p>
              )}
              {(summary.unmatchedDataKeys.length > 0 || summary.missingDenominatorKeys.length > 0) && (
                <p className="text-xs text-amber-700 mt-2">
                  Review the join report before using this map in teaching or reports.
                </p>
              )}
            </div>
          )}

          <AdvancedOptions>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classification</label>
              <select
                value={classificationMethod}
                onChange={(event) => setClassificationMethod(event.target.value as ClassificationMethod)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quantile">Quantile</option>
                <option value="equal">Equal interval</option>
                <option value="natural">Natural breaks</option>
                <option value="manual">Manual breaks</option>
              </select>
            </div>

            {classificationMethod !== 'manual' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Classes ({classCount})</label>
                <input
                  type="range"
                  min="3"
                  max="7"
                  value={classCount}
                  onChange={(event) => setClassCount(Number(event.target.value))}
                  className="w-full"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manual Breaks</label>
                <input
                  type="text"
                  value={manualBreaks}
                  onChange={(event) => setManualBreaks(event.target.value)}
                  placeholder="e.g., 10, 25, 50, 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Up to 6 breaks. If you write decimals with a comma, separate the values with semicolons (2,5; 7,5).
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Map</label>
              <select
                value={baseMap}
                onChange={(event) => {
                  setBaseMap(event.target.value as BaseMap);
                  setBasemapFailed(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet street map</option>
                <option value="street">Street map</option>
                <option value="topo">Topographic</option>
                <option value="none">No base map</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export Base Map</label>
              <select
                value={exportBaseMap}
                onChange={(event) => setExportBaseMap(event.target.value as ExportBaseMap)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet publication map</option>
                <option value="none">No base map</option>
                <option value="current">Same as current view</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Title</label>
              <input
                type="text"
                value={mapTitle}
                onChange={(event) => setMapTitle(event.target.value)}
                placeholder="e.g., Injury rate by district"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
              <input
                type="text"
                value={mapCaption}
                onChange={(event) => setMapCaption(event.target.value)}
                placeholder="Source, period, and denominator note"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(event) => setShowLegend(event.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Show legend</span>
            </label>
          </AdvancedOptions>

          {joinResult && (
            <ResultsActions
              actions={[
                {
                  label: isExporting ? 'Exporting...' : 'Export PNG',
                  onClick: exportMap,
                  icon: ExportIcons.image,
                  disabled: isExporting,
                  variant: 'primary',
                },
                {
                  label: 'Export GeoJSON',
                  onClick: exportJoinedGeoJSON,
                  icon: ExportIcons.download,
                  variant: 'secondary',
                },
              ]}
            />
          )}

          <HelpPanel title="Area Map Notes">
            <div className="space-y-3 text-sm text-gray-700">
              <p>Area maps work best when boundaries, observation records, and denominator records share a stable area code or official area name.</p>
              <p>For rates, import the census or denominator table as a separate dataset first, then select it here.</p>
              <p>Always review unmatched areas before interpreting counts or rates. Name mismatches are common in field data.</p>
            </div>
          </HelpPanel>
        </div>
      </div>

      <div className="flex-1 relative min-h-[420px] lg:min-h-0">
        <div ref={mapContainerRef} className="h-full w-full relative bg-gray-100">
          {boundaries && boundaryKey ? (
            <>
              {mapTitle && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-lg pointer-events-none">
                  <div className="bg-white/95 rounded-lg px-4 py-2 shadow-lg">
                    <h2 className="text-sm font-semibold text-gray-900 text-center">{mapTitle}</h2>
                  </div>
                </div>
              )}

              <MapContainer
                center={[0, 0]}
                zoom={2}
                maxZoom={MAP_MAX_ZOOM}
                style={{ height: '100%', width: '100%' }}
              >
                {/* Keyed by tile source so each provider is its own layer and
                    takes its attribution with it when it goes. */}
                {activeBaseMap !== 'none' && (
                  <TileLayer
                    key={basemaps[activeBaseMap].url}
                    url={basemaps[activeBaseMap].url}
                    attribution={basemaps[activeBaseMap].attribution}
                    opacity={basemaps[activeBaseMap].opacity}
                    maxZoom={MAP_MAX_ZOOM}
                    maxNativeZoom={basemaps[activeBaseMap].maxNativeZoom}
                    crossOrigin="anonymous"
                    eventHandlers={{
                      tileerror: () => setBasemapFailed(true),
                      tileload: () => setBasemapFailed(false),
                    }}
                  />
                )}
                <ScaleControl position="bottomleft" imperial={false} metric={true} />
                <FitGeoJsonBounds boundaries={boundaries} />
                <GeoJSON
                  key={`${boundaryFileName}-${boundaryKey}-${metric}-${rateMultiplier}-${breaks.join('|')}-${mappedValues.length}-${joinVersion}-${summary?.duplicateDenominatorKeys.join(',') ?? ''}`}
                  data={boundaries as unknown as FeatureCollection}
                  style={(feature) => styleFeature(feature as unknown as GeoJsonFeature)}
                  onEachFeature={(feature, layer) => bindFeaturePopup(feature as unknown as GeoJsonFeature, layer)}
                />
              </MapContainer>

              {mapCaption && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] max-w-lg pointer-events-none">
                  <div className="bg-white/95 rounded-lg px-4 py-2 shadow-lg">
                    <p className="text-xs text-gray-700 text-center">{mapCaption}</p>
                  </div>
                </div>
              )}

              {showLegend && (legendItems.length > 0 || hasWithheldAreas || hasNoDataAreas) && (
                <div className={`absolute ${mapCaption ? 'bottom-16' : 'bottom-6'} right-4 z-[1000] bg-white/95 rounded-lg shadow-lg p-3 max-w-xs`}>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {metric === 'rate' ? `Rate per ${rateMultiplier.toLocaleString()}` : 'Record count'}
                  </p>
                  <div className="space-y-1">
                    {legendItems.map(item => (
                      <div key={`${item.color}-${item.label}`} className="flex items-center gap-2">
                        <span className="w-4 h-3 rounded-sm border border-gray-400" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-gray-700">{item.label}</span>
                      </div>
                    ))}
                    {hasWithheldAreas && (
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <span className="w-4 h-3 rounded-sm border border-dashed border-gray-600" style={{ backgroundColor: WITHHELD_FILL }} />
                        <span className="text-xs text-gray-700">{WITHHELD_LABEL}</span>
                      </div>
                    )}
                    {hasNoDataAreas && (
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <span className="w-4 h-3 rounded-sm border border-gray-400" style={{ backgroundColor: NO_DATA_FILL }} />
                        <span className="text-xs text-gray-500">No data</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {basemapFailed && activeBaseMap !== 'none' && (
                <div className="map-export-exclude absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] max-w-md">
                  <div className="bg-white/95 border border-gray-300 rounded-lg px-3 py-2 shadow-lg">
                    <p className="text-xs text-gray-700">
                      The base map could not be loaded. You may be offline, or the map provider may be unavailable. The areas are still drawn correctly; choose "No base map" to export without it.
                    </p>
                  </div>
                </div>
              )}

              {(exportStatus || exportError) && (
                <div className="map-export-exclude absolute top-4 right-4 z-[1100] max-w-sm">
                  <div className={`${exportError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'} border rounded-lg px-3 py-2 shadow-lg`}>
                    <p className="text-xs">{exportError || exportStatus}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-lg text-gray-600">Upload Boundaries</p>
                <p className="text-sm text-gray-500 mt-1">
                  Add a GeoJSON boundary file, then choose the fields that connect boundaries to your observation and denominator data.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
