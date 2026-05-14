import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { GeoJSON, MapContainer, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import { geoJSON as createGeoJSONLayer } from 'leaflet';
import html2canvas from 'html2canvas';
import type { FeatureCollection } from 'geojson';
import type { Dataset } from '../../types/analysis';
import { AdvancedOptions, ExportIcons, HelpPanel, ResultsActions, TabHeader } from '../shared';
import { exportToCSV } from '../../utils/csvParser';
import { useLocale } from '../../contexts/LocaleContext';
import {
  buildAreaJoin,
  buildJoinReport,
  classifyValues,
  formatAreaValue,
  getClassIndex,
  getGeoJsonPropertyKeys,
  isFeatureCollection,
  joinReportColumns,
  normalizeAreaKey,
  suggestAreaField,
  suggestBoundaryKey,
} from '../../utils/areaMap';
import type { AreaMetric, ClassificationMethod, GeoJsonFeature, GeoJsonFeatureCollection, JoinedArea } from '../../utils/areaMap';

interface AreaMapProps {
  dataset: Dataset;
  datasets: Dataset[];
}

type BaseMap = 'street' | 'quiet' | 'topo';

const rateMultipliers = [1000, 10000, 100000];

const choroplethColors = [
  '#EFF6FF',
  '#BFDBFE',
  '#93C5FD',
  '#60A5FA',
  '#2563EB',
  '#1E3A8A',
  '#172554',
];

const tileUrls: Record<BaseMap, { url: string; attribution: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  quiet: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
  },
};

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
  return {
    ...area.feature.properties,
    epikit_area_key: area.key,
    epikit_count: area.count,
    epikit_denominator: area.denominator,
    epikit_rate: area.rate,
    epikit_metric: metric,
    epikit_rate_multiplier: metric === 'rate' ? rateMultiplier : null,
    epikit_mapped_value: area.value,
  };
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

  const [boundaries, setBoundaries] = useState<GeoJsonFeatureCollection | null>(null);
  const [boundaryFileName, setBoundaryFileName] = useState('');
  const [boundaryError, setBoundaryError] = useState('');
  const [boundaryKey, setBoundaryKey] = useState<string>(() => (saved.boundaryKey as string) || '');
  const [areaField, setAreaField] = useState<string>(() => (saved.areaField as string) || suggestAreaField(dataset.columns));
  const [metric, setMetric] = useState<AreaMetric>(() => (saved.metric as AreaMetric) || 'count');
  const [denominatorDatasetId, setDenominatorDatasetId] = useState<string>(() => (saved.denominatorDatasetId as string) || '');
  const [denominatorKey, setDenominatorKey] = useState<string>(() => (saved.denominatorKey as string) || '');
  const [denominatorValue, setDenominatorValue] = useState<string>(() => (saved.denominatorValue as string) || '');
  const [rateMultiplier, setRateMultiplier] = useState<number>(() => (saved.rateMultiplier as number) || 100000);
  const [classificationMethod, setClassificationMethod] = useState<ClassificationMethod>(() => (saved.classificationMethod as ClassificationMethod) || 'quantile');
  const [classCount, setClassCount] = useState<number>(() => (saved.classCount as number) || 5);
  const [manualBreaks, setManualBreaks] = useState<string>(() => (saved.manualBreaks as string) || '');
  const [baseMap, setBaseMap] = useState<BaseMap>(() => (saved.baseMap as BaseMap) || 'quiet');
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
        classificationMethod,
        classCount,
        manualBreaks,
        baseMap,
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
    classificationMethod,
    classCount,
    manualBreaks,
    baseMap,
    mapTitle,
    mapCaption,
    showLegend,
  ]);

  useEffect(() => {
    if (!boundaryKey && propertyKeys.length > 0) {
      setBoundaryKey(suggestBoundaryKey(propertyKeys));
    }
  }, [boundaryKey, propertyKeys]);

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

  const joinResult = useMemo(() => {
    if (!boundaries || !boundaryKey || !areaField) return null;

    return buildAreaJoin({
      records: dataset.records,
      areaField,
      boundaries,
      boundaryKey,
      metric,
      denominatorDataset,
      denominatorKey,
      denominatorValue,
      rateMultiplier,
    });
  }, [
    areaField,
    boundaries,
    boundaryKey,
    dataset.records,
    denominatorDataset,
    denominatorKey,
    denominatorValue,
    metric,
    rateMultiplier,
  ]);

  const areaByKey = useMemo(() => {
    const lookup = new Map<string, JoinedArea>();
    joinResult?.areas.forEach(area => lookup.set(area.key, area));
    return lookup;
  }, [joinResult]);

  const mappedValues = useMemo(() => (
    joinResult?.areas
      .map(area => area.value)
      .filter((value): value is number => value !== null && Number.isFinite(value)) ?? []
  ), [joinResult]);

  const breaks = useMemo(() => (
    classifyValues(mappedValues, classificationMethod, classCount, manualBreaks)
  ), [mappedValues, classificationMethod, classCount, manualBreaks]);

  const joinedFeatureCollection = useMemo(() => {
    if (!joinResult) return null;
    return {
      type: 'FeatureCollection',
      features: joinResult.areas.map(area => ({
        ...area.feature,
        properties: makeAreaProperties(area, metric, rateMultiplier),
      })),
    };
  }, [joinResult, metric, rateMultiplier]);

  const handleBoundaryFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isFeatureCollection(parsed)) {
        setBoundaryError('This file is not a GeoJSON FeatureCollection.');
        return;
      }
      setBoundaries(parsed);
      setBoundaryFileName(file.name);
      setBoundaryError('');
      const keys = getGeoJsonPropertyKeys(parsed);
      setBoundaryKey(suggestBoundaryKey(keys));
    } catch {
      setBoundaryError('The boundary file could not be read. Upload a valid GeoJSON file.');
    } finally {
      event.target.value = '';
    }
  };

  const getFillColor = (value: number | null): string => {
    const classIndex = getClassIndex(value, breaks);
    if (classIndex === null) return '#E5E7EB';
    return choroplethColors[Math.min(classIndex, choroplethColors.length - 1)];
  };

  const styleFeature = (feature: GeoJsonFeature | undefined) => {
    const area = areaByKey.get(getAreaKey(feature, boundaryKey));
    return {
      fillColor: getFillColor(area?.value ?? null),
      fillOpacity: area?.value === null || area === undefined ? 0.45 : 0.78,
      color: '#475569',
      weight: 1,
      opacity: 0.9,
    };
  };

  const bindFeaturePopup = (feature: GeoJsonFeature, layer: { bindPopup: (content: string) => void }) => {
    const area = areaByKey.get(getAreaKey(feature, boundaryKey));
    const title = area?.label || String(feature.properties?.[boundaryKey] ?? 'Area');
    const rateLabel = metric === 'rate'
      ? `<div><strong>Rate:</strong> ${formatAreaValue(area?.rate ?? null)} per ${rateMultiplier.toLocaleString()}</div>`
      : '';
    const denominatorLabel = metric === 'rate'
      ? `<div><strong>Denominator:</strong> ${area?.denominator?.toLocaleString() ?? 'No match'}</div>`
      : '';
    layer.bindPopup(`
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(title)}</div>
        <div><strong>Count:</strong> ${area?.count ?? 0}</div>
        ${denominatorLabel}
        ${rateLabel}
      </div>
    `);
  };

  const exportMap = async () => {
    if (!mapContainerRef.current) return;

    setIsExporting(true);
    setExportStatus('Preparing area map export...');
    setExportError('');
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        imageTimeout: 15000,
        ignoreElements: element => element.classList.contains('map-export-exclude'),
      });
      const link = document.createElement('a');
      link.download = `area-map-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
    if (!joinResult) return;
    const csv = exportToCSV(joinReportColumns, buildJoinReport(joinResult), { localeConfig });
    downloadText(csv, `area_map_join_report_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  };

  const exportJoinedGeoJSON = () => {
    if (!joinedFeatureCollection) return;
    downloadText(
      JSON.stringify(joinedFeatureCollection, null, 2),
      `area_map_joined_${new Date().toISOString().split('T')[0]}.geojson`,
      'application/geo+json'
    );
  };

  const legendItems = useMemo(() => {
    if (mappedValues.length === 0) return [];
    const min = Math.min(...mappedValues);
    const ranges: Array<{ label: string; color: string }> = [];
    for (let i = 0; i <= breaks.length; i++) {
      const lower = i === 0 ? min : breaks[i - 1];
      const upper = breaks[i];
      const label = upper === undefined
        ? `> ${formatAreaValue(lower)}`
        : `${formatAreaValue(lower)} - ${formatAreaValue(upper)}`;
      ranges.push({ label, color: choroplethColors[Math.min(i, choroplethColors.length - 1)] });
    }
    return ranges;
  }, [breaks, mappedValues]);

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
            <label className="block text-sm font-medium text-gray-700 mb-1">Map Value</label>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as AreaMetric)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="count">Observation count by area</option>
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
                </>
              )}
            </div>
          )}

          {joinResult && (
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
                <span className="text-gray-500">Boundary areas</span>
                <span className="text-right font-medium">{joinResult.summary.boundaryCount}</span>
                <span className="text-gray-500">Matched areas</span>
                <span className="text-right font-medium">{joinResult.summary.matchedBoundaryCount}</span>
                <span className="text-gray-500">Unmatched data areas</span>
                <span className="text-right font-medium">{joinResult.summary.unmatchedDataKeys.length}</span>
                <span className="text-gray-500">Unmatched boundaries</span>
                <span className="text-right font-medium">{joinResult.summary.unmatchedBoundaryKeys.length}</span>
                {metric === 'rate' && (
                  <>
                    <span className="text-gray-500">Missing denominators</span>
                    <span className="text-right font-medium">{joinResult.summary.missingDenominatorKeys.length}</span>
                    <span className="text-gray-500">Unmatched denominator areas</span>
                    <span className="text-right font-medium">{joinResult.summary.unmatchedDenominatorKeys.length}</span>
                  </>
                )}
              </div>
              {(joinResult.summary.unmatchedDataKeys.length > 0 || joinResult.summary.missingDenominatorKeys.length > 0) && (
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
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Map</label>
              <select
                value={baseMap}
                onChange={(event) => setBaseMap(event.target.value as BaseMap)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet street map</option>
                <option value="street">Street map</option>
                <option value="topo">Topographic</option>
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
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url={tileUrls[baseMap].url}
                  attribution={tileUrls[baseMap].attribution}
                  opacity={baseMap === 'quiet' ? 0.35 : 1}
                  crossOrigin="anonymous"
                />
                <ScaleControl position="bottomleft" imperial={false} metric={true} />
                <FitGeoJsonBounds boundaries={boundaries} />
                <GeoJSON
                  key={`${boundaryFileName}-${boundaryKey}-${metric}-${breaks.join('|')}-${mappedValues.length}`}
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

              {showLegend && legendItems.length > 0 && (
                <div className={`absolute ${mapCaption ? 'bottom-16' : 'bottom-4'} right-4 z-[1000] bg-white/95 rounded-lg shadow-lg p-3 max-w-xs`}>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {metric === 'rate' ? `Rate per ${rateMultiplier.toLocaleString()}` : 'Observation count'}
                  </p>
                  <div className="space-y-1">
                    {legendItems.map(item => (
                      <div key={`${item.color}-${item.label}`} className="flex items-center gap-2">
                        <span className="w-4 h-3 rounded-sm border border-gray-300" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-gray-700">{item.label}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                      <span className="w-4 h-3 rounded-sm border border-gray-300 bg-gray-200" />
                      <span className="text-xs text-gray-500">No data</span>
                    </div>
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

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
