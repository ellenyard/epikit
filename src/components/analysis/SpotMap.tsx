import { useState, useMemo, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, ScaleControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import html2canvas from 'html2canvas';
import type { Dataset, CaseRecord, DataColumn } from '../../types/analysis';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { SpotMapTutorial } from '../tutorials/SpotMapTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';
import { exportToCSV } from '../../utils/csvParser';
import { useLocale } from '../../contexts/LocaleContext';

interface SpotMapProps {
  dataset: Dataset;
}

type ColorScheme = 'default' | 'classification' | 'colorblind' | 'sequential';
type CoordinateAxis = 'lat' | 'lng';
type ExportPreset = 'powerpoint' | 'report' | 'manuscript' | 'square' | 'highres';
type MapStyle = 'street' | 'quiet' | 'satellite' | 'topo' | 'none';
type ExportBaseMap = 'current' | 'quiet' | 'none';

interface MapCase {
  record: CaseRecord;
  lat: number;
  lng: number;
  displayLat: number;  // Jittered coordinates for display
  displayLng: number;
  classification: string;
}

interface CoordinateQAResult {
  totalRecords: number;
  validCoordinates: number;
  missingLatitude: number;
  missingLongitude: number;
  zeroPlaceholders: number;
  outOfRange: number;
  likelySwapped: number;
  duplicateCoordinates: number;
  lowPrecision: number;
  excludedRecords: CaseRecord[];
}

// Dynamic color palettes for any classification variable
const defaultColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const colorblindColors = [
  '#0077BB', '#33BBEE', '#009988', '#EE7733', '#CC3311',
  '#EE3377', '#BBBBBB', '#000000',
];

const sequentialColors = [
  '#99000d', '#cb181d', '#ef3b2c', '#fb6a4a', '#fc9272',
  '#fcbba1', '#fee0d2', '#fee5d9',
];

const exportPresets: Record<ExportPreset, { label: string; scale: number }> = {
  powerpoint: { label: 'PowerPoint 16:9', scale: 2 },
  report: { label: 'Report', scale: 2 },
  manuscript: { label: 'Manuscript', scale: 3 },
  square: { label: 'Square', scale: 2 },
  highres: { label: 'High-resolution PNG', scale: 3 },
};

// Known case status colors used when values match epidemiological terminology
const caseStatusColors: Record<string, string> = {
  'Confirmed': '#DC2626',
  'Probable': '#F59E0B',
  'Suspected': '#3B82F6',
  'Not a case': '#22C55E',
  'Unknown': '#9CA3AF',
};

function getSemanticCategoryColor(classification: string): string | null {
  const normalized = classification.toLowerCase().trim();

  if (normalized.includes('non-severe') || normalized.includes('non severe')) return '#64748B';
  if (normalized.includes('severe')) return '#DC2626';
  if (normalized === 'yes' || normalized === 'true') return '#DC2626';
  if (normalized === 'no' || normalized === 'false') return '#64748B';

  return null;
}

function getMarkerColor(
  classification: string,
  scheme: ColorScheme,
  allValues: string[],
  customColors: Record<string, string> = {}
): string {
  if (customColors[classification]) return customColors[classification];
  if (scheme === 'default') return '#3B82F6';

  // For classification scheme, use known case status colors when they match
  if (scheme === 'classification') {
    if (caseStatusColors[classification]) return caseStatusColors[classification];
    const semanticColor = getSemanticCategoryColor(classification);
    if (semanticColor) return semanticColor;
  }

  // Fall back to index-based dynamic colors for any value
  const index = allValues.indexOf(classification);
  const i = index >= 0 ? index : 0;

  switch (scheme) {
    case 'classification':
      return defaultColors[i % defaultColors.length];
    case 'colorblind':
      return colorblindColors[i % colorblindColors.length];
    case 'sequential':
      return sequentialColors[i % sequentialColors.length];
    default:
      return '#3B82F6';
  }
}

function parseCoordinateValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const direction = raw.match(/[NSEW]/i)?.[0].toUpperCase();
  const match = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;

  let parsed = Number(match[0].replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;

  if ((direction === 'S' || direction === 'W') && parsed > 0) {
    parsed = -parsed;
  }

  return parsed;
}

function hasMissingCoordinate(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

function isCoordinateInRange(value: number, axis: CoordinateAxis): boolean {
  return axis === 'lat'
    ? value >= -90 && value <= 90
    : value >= -180 && value <= 180;
}

function isZeroCoordinatePlaceholder(lat: number, lng: number): boolean {
  return lat === 0 && lng === 0;
}

function looksLikeSwappedCoordinates(lat: number, lng: number): boolean {
  return Math.abs(lat) > 60 && Math.abs(lng) <= 90 && Math.abs(lat) > Math.abs(lng);
}

function coordinatePrecision(value: unknown): number {
  const raw = String(value ?? '').trim();
  const match = raw.match(/[.,](\d+)/);
  return match ? match[1].length : 0;
}

function isLikelyCoordinateColumn(
  column: DataColumn,
  records: CaseRecord[],
  axis: CoordinateAxis
): boolean {
  const name = `${column.key} ${column.label}`.toLowerCase();
  const hasNameMatch = axis === 'lat'
    ? /(^|[_\s-])(lat|latitude|gps_latitude|_latitude)([_\s-]|$)/.test(name) || name.includes('location-latitude')
    : /(^|[_\s-])(lon|lng|long|longitude|gps_longitude|_longitude)([_\s-]|$)/.test(name) || name.includes('location-longitude');

  if (hasNameMatch) return true;
  if (column.type === 'number') return true;

  const values = records
    .map(record => record[column.key])
    .filter(value => !hasMissingCoordinate(value));

  if (values.length === 0) return false;

  const parseable = values.filter(value => {
    const parsed = parseCoordinateValue(value);
    return parsed !== null && isCoordinateInRange(parsed, axis);
  });

  return parseable.length / values.length >= 0.8;
}

function getDefaultPopupColumns(columns: DataColumn[]): string[] {
  const preferredPatterns = [
    /(^|_)id($|_)/,
    /date/,
    /status|classification|case/,
    /district|location|road|facility|village/,
    /outcome|severity|severe/,
  ];

  const preferred = columns.filter(col => {
    const name = `${col.key} ${col.label}`.toLowerCase();
    return preferredPatterns.some(pattern => pattern.test(name));
  });

  const keys = preferred.map(col => col.key);
  for (const col of columns) {
    if (keys.length >= 6) break;
    if (!keys.includes(col.key)) keys.push(col.key);
  }

  return keys.slice(0, 6);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function waitForNextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function analyzeCoordinateQuality(
  records: CaseRecord[],
  latColumn: string,
  lngColumn: string
): CoordinateQAResult {
  const result: CoordinateQAResult = {
    totalRecords: records.length,
    validCoordinates: 0,
    missingLatitude: 0,
    missingLongitude: 0,
    zeroPlaceholders: 0,
    outOfRange: 0,
    likelySwapped: 0,
    duplicateCoordinates: 0,
    lowPrecision: 0,
    excludedRecords: [],
  };

  if (!latColumn || !lngColumn) return result;

  const coordinateCounts = new Map<string, number>();
  const validRows: Array<{ lat: number; lng: number; rawLat: unknown; rawLng: unknown }> = [];

  records.forEach(record => {
    const rawLat = record[latColumn];
    const rawLng = record[lngColumn];
    const reasons: string[] = [];

    if (hasMissingCoordinate(rawLat)) {
      result.missingLatitude++;
      reasons.push('Missing latitude');
    }

    if (hasMissingCoordinate(rawLng)) {
      result.missingLongitude++;
      reasons.push('Missing longitude');
    }

    const lat = parseCoordinateValue(rawLat);
    const lng = parseCoordinateValue(rawLng);

    if (lat === null || lng === null) {
      if (reasons.length === 0) reasons.push('Coordinates could not be parsed');
      result.excludedRecords.push({ ...record, _map_exclusion_reason: reasons.join('; ') });
      return;
    }

    const swappedLooksValid = isCoordinateInRange(lng, 'lat') && isCoordinateInRange(lat, 'lng');
    const inRange = isCoordinateInRange(lat, 'lat') && isCoordinateInRange(lng, 'lng');

    if (isZeroCoordinatePlaceholder(lat, lng)) {
      result.zeroPlaceholders++;
      reasons.push('Zero coordinate placeholder');
    }

    if (!inRange) {
      result.outOfRange++;
      reasons.push('Coordinates outside valid latitude/longitude range');
      if (swappedLooksValid) {
        result.likelySwapped++;
        reasons.push('Latitude/longitude may be swapped');
      }
    }

    if (reasons.length > 0) {
      result.excludedRecords.push({ ...record, _map_exclusion_reason: reasons.join('; ') });
      return;
    }

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
    if (looksLikeSwappedCoordinates(lat, lng)) {
      result.likelySwapped++;
    }
    validRows.push({ lat, lng, rawLat, rawLng });
  });

  result.validCoordinates = validRows.length;
  result.duplicateCoordinates = Array.from(coordinateCounts.values())
    .filter(count => count > 1)
    .reduce((sum, count) => sum + count, 0);
  result.lowPrecision = validRows.filter(({ rawLat, rawLng }) =>
    coordinatePrecision(rawLat) > 0 &&
    coordinatePrecision(rawLng) > 0 &&
    (coordinatePrecision(rawLat) <= 2 || coordinatePrecision(rawLng) <= 2)
  ).length;

  return result;
}

// Deterministic jitter function for privacy
function jitterCoordinates(
  lat: number,
  lng: number,
  distanceMeters: number,
  seed: string
): { lat: number; lng: number } {
  if (distanceMeters === 0) return { lat, lng };

  // Simple hash function to generate deterministic random values from seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate deterministic "random" angle and radius
  const angle = ((hash % 360) / 360) * 2 * Math.PI;
  const radius = ((Math.abs(hash) % 1000) / 1000) * distanceMeters;

  // Convert meters to degrees
  const dLat = radius * Math.cos(angle) / 111320;
  const dLng = radius * Math.sin(angle) / (111320 * Math.cos(lat * Math.PI / 180));

  return {
    lat: lat + dLat,
    lng: lng + dLng,
  };
}

// Component to fit map bounds
function FitBounds({ cases }: { cases: MapCase[] }) {
  const map = useMap();

  useEffect(() => {
    if (cases.length > 0) {
      const bounds = cases.map(c => [c.displayLat, c.displayLng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [cases, map]);

  return null;
}

export function SpotMap({ dataset }: SpotMapProps) {
  const { config: localeConfig } = useLocale();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recipeInputRef = useRef<HTMLInputElement>(null);

  // Persistence key for this dataset
  const persistenceKey = `epikit_spotmap_${dataset.id}`;

  // Load persisted state once during initialization (avoids race conditions with auto-detect effects)
  const [saved] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem(persistenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // State initialized from localStorage
  const [latColumn, setLatColumn] = useState<string>(() => (saved.latColumn as string) || '');
  const [lngColumn, setLngColumn] = useState<string>(() => (saved.lngColumn as string) || '');
  const [classificationColumn, setClassificationColumn] = useState<string>(() => (saved.classificationColumn as string) || '');
  const [filterBy, setFilterBy] = useState<string>(() => (saved.filterBy as string) ?? '');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    const arr = saved.selectedFilterValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => (saved.colorScheme as ColorScheme) || 'classification');
  const [markerSize, setMarkerSize] = useState<number>(() => (saved.markerSize as number) ?? 8);
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => (saved.mapStyle as MapStyle) || 'street');
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportError, setExportError] = useState<string>('');
  const [exportPreset, setExportPreset] = useState<ExportPreset>(() => (saved.exportPreset as ExportPreset) || 'powerpoint');
  const [exportBaseMap, setExportBaseMap] = useState<ExportBaseMap>(() => (saved.exportBaseMap as ExportBaseMap) || 'quiet');
  const [customCategoryColors, setCustomCategoryColors] = useState<Record<string, string>>(() => {
    return isObjectRecord(saved.customCategoryColors) ? saved.customCategoryColors as Record<string, string> : {};
  });
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    const arr = saved.categoryOrder;
    return Array.isArray(arr) ? arr as string[] : [];
  });
  const [popupColumns, setPopupColumns] = useState<string[]>(() => {
    const arr = saved.popupColumns;
    return Array.isArray(arr) ? arr as string[] : getDefaultPopupColumns(dataset.columns);
  });

  // Privacy safeguards
  const [obfuscateLocations, setObfuscateLocations] = useState<boolean>(() => saved.obfuscateLocations !== undefined ? saved.obfuscateLocations as boolean : true);
  const [jitterDistance, setJitterDistance] = useState<number>(() => (saved.jitterDistance as number) ?? 500);
  const [jitterIdColumn, setJitterIdColumn] = useState<string>(() => (saved.jitterIdColumn as string) || '');

  // Map title and caption
  const [mapTitle, setMapTitle] = useState<string>(() => (saved.mapTitle as string) ?? '');
  const [mapCaption, setMapCaption] = useState<string>(() => (saved.mapCaption as string) ?? '');

  // North arrow
  const [showNorthArrow, setShowNorthArrow] = useState<boolean>(() => saved.showNorthArrow !== undefined ? saved.showNorthArrow as boolean : false);

  // Point clustering
  const [enableClustering, setEnableClustering] = useState<boolean>(() => saved.enableClustering !== undefined ? saved.enableClustering as boolean : false);

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(288); // 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);

  // Save all state to localStorage when it changes
  useEffect(() => {
    try {
      const toSave = {
        latColumn,
        lngColumn,
        classificationColumn,
        colorScheme,
        markerSize,
        mapStyle,
        obfuscateLocations,
        jitterDistance,
        mapTitle,
        mapCaption,
        showNorthArrow,
        enableClustering,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
        exportPreset,
        exportBaseMap,
        customCategoryColors,
        categoryOrder,
        popupColumns,
        jitterIdColumn,
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save spot map settings:', e);
    }
  }, [persistenceKey, latColumn, lngColumn, classificationColumn, colorScheme, markerSize,
    mapStyle, obfuscateLocations, jitterDistance, mapTitle, mapCaption, showNorthArrow,
    enableClustering, filterBy, selectedFilterValues, exportPreset, exportBaseMap, customCategoryColors,
    categoryOrder, popupColumns, jitterIdColumn]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setPanelWidth(Math.max(200, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const latitudeOptions = useMemo(() => (
    dataset.columns.filter(col => isLikelyCoordinateColumn(col, dataset.records, 'lat'))
  ), [dataset.columns, dataset.records]);

  const longitudeOptions = useMemo(() => (
    dataset.columns.filter(col => isLikelyCoordinateColumn(col, dataset.records, 'lng'))
  ), [dataset.columns, dataset.records]);

  const coordinateQA = useMemo(() => (
    analyzeCoordinateQuality(dataset.records, latColumn, lngColumn)
  ), [dataset.records, latColumn, lngColumn]);

  useEffect(() => {
    setPopupColumns(previous => {
      const validKeys = new Set(dataset.columns.map(col => col.key));
      const next = previous.filter(key => validKeys.has(key));
      const withFallback = next.length > 0 ? next : getDefaultPopupColumns(dataset.columns);
      return arraysEqual(previous, withFallback) ? previous : withFallback;
    });
  }, [dataset.columns]);

  // Export map as PNG
  const exportMap = async () => {
    if (!mapContainerRef.current) return;

    setIsExporting(true);
    setExportError('');
    setExportStatus('Preparing a clean map export...');
    try {
      await waitForNextPaint();
      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scale: exportPresets[exportPreset].scale,
        imageTimeout: 15000,
        logging: false,
        ignoreElements: element => element.classList.contains('map-export-exclude'),
      });

      const link = document.createElement('a');
      link.download = `spot-map-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExportStatus('PNG downloaded.');
      window.setTimeout(() => setExportStatus(''), 4000);
    } catch (error) {
      console.error('Failed to export map:', error);
      setExportError(
        'PNG export did not finish. Try the Street base map, then export again. If it still fails, use GeoJSON/CSV export or a browser screenshot as a fallback.'
      );
      setExportStatus('');
    } finally {
      setIsExporting(false);
    }
  };

  // Export filtered dataset as CSV
  const exportDatasetCSV = () => {
    if (filteredCases.length === 0) return;

    const filteredRecords = filteredCases.map(c => c.record);
    const csv = exportToCSV(dataset.columns, filteredRecords, { localeConfig });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spot_map_data_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportExcludedRecordsCSV = () => {
    if (coordinateQA.excludedRecords.length === 0) return;

    const columns: DataColumn[] = [
      ...dataset.columns,
      { key: '_map_exclusion_reason', label: 'Map Exclusion Reason', type: 'text' },
    ];
    const csv = exportToCSV(columns, coordinateQA.excludedRecords, { localeConfig });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spot_map_excluded_records_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportGeoJSON = () => {
    if (filteredCases.length === 0) return;

    const featureCollection = {
      type: 'FeatureCollection',
      features: filteredCases.map(caseData => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [caseData.displayLng, caseData.displayLat],
        },
        properties: {
          ...caseData.record,
          _original_latitude: caseData.lat,
          _original_longitude: caseData.lng,
          _display_latitude: caseData.displayLat,
          _display_longitude: caseData.displayLng,
          _location_privacy: obfuscateLocations ? `jittered_${jitterDistance}m` : 'exact',
        },
      })),
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spot_map_points_${new Date().toISOString().split('T')[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveMapRecipe = () => {
    const recipe = {
      version: 1,
      module: 'spot-map',
      datasetName: dataset.name,
      latColumn,
      lngColumn,
      classificationColumn,
      filterBy,
      selectedFilterValues: Array.from(selectedFilterValues),
      colorScheme,
      customCategoryColors,
      categoryOrder,
      markerSize,
      mapStyle,
      obfuscateLocations,
      jitterDistance,
      jitterIdColumn,
      mapTitle,
      mapCaption,
      showNorthArrow,
      enableClustering,
      popupColumns,
      exportPreset,
      exportBaseMap,
    };

    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name || 'spot-map'}_recipe.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadMapRecipe = async (event: ChangeEvent<HTMLInputElement>) => {
    const recipeFile = event.target.files?.[0];
    if (!recipeFile) return;

    try {
      const recipe = JSON.parse(await recipeFile.text()) as unknown;
      if (!isObjectRecord(recipe) || recipe.module !== 'spot-map') {
        setExportError('This file is not an EpiKit spot map recipe.');
        return;
      }

      const validKeys = new Set(dataset.columns.map(col => col.key));
      const setColumnIfValid = (value: unknown, setter: (next: string) => void) => {
        if (typeof value === 'string' && (value === '' || validKeys.has(value))) setter(value);
      };

      setColumnIfValid(recipe.latColumn, setLatColumn);
      setColumnIfValid(recipe.lngColumn, setLngColumn);
      setColumnIfValid(recipe.classificationColumn, setClassificationColumn);
      setColumnIfValid(recipe.filterBy, setFilterBy);
      if (Array.isArray(recipe.selectedFilterValues)) {
        setSelectedFilterValues(new Set(recipe.selectedFilterValues.filter(value => typeof value === 'string')));
      }
      if (typeof recipe.colorScheme === 'string') setColorScheme(recipe.colorScheme as ColorScheme);
      if (isObjectRecord(recipe.customCategoryColors)) setCustomCategoryColors(recipe.customCategoryColors as Record<string, string>);
      if (Array.isArray(recipe.categoryOrder)) setCategoryOrder(recipe.categoryOrder.filter(value => typeof value === 'string'));
      if (typeof recipe.markerSize === 'number') setMarkerSize(recipe.markerSize);
      if (recipe.mapStyle === 'street' || recipe.mapStyle === 'quiet' || recipe.mapStyle === 'satellite' || recipe.mapStyle === 'topo' || recipe.mapStyle === 'none') setMapStyle(recipe.mapStyle);
      if (recipe.exportBaseMap === 'current' || recipe.exportBaseMap === 'quiet' || recipe.exportBaseMap === 'none') setExportBaseMap(recipe.exportBaseMap);
      if (typeof recipe.obfuscateLocations === 'boolean') setObfuscateLocations(recipe.obfuscateLocations);
      if (typeof recipe.jitterDistance === 'number') setJitterDistance(recipe.jitterDistance);
      setColumnIfValid(recipe.jitterIdColumn, setJitterIdColumn);
      if (typeof recipe.mapTitle === 'string') setMapTitle(recipe.mapTitle);
      if (typeof recipe.mapCaption === 'string') setMapCaption(recipe.mapCaption);
      if (typeof recipe.showNorthArrow === 'boolean') setShowNorthArrow(recipe.showNorthArrow);
      if (typeof recipe.enableClustering === 'boolean') setEnableClustering(recipe.enableClustering);
      if (Array.isArray(recipe.popupColumns)) {
        setPopupColumns(recipe.popupColumns.filter(value => typeof value === 'string' && validKeys.has(value)));
      }
      if (typeof recipe.exportPreset === 'string' && recipe.exportPreset in exportPresets) {
        setExportPreset(recipe.exportPreset as ExportPreset);
      }
      setExportStatus('Map recipe loaded.');
      setExportError('');
      window.setTimeout(() => setExportStatus(''), 4000);
    } catch {
      setExportError('The map recipe could not be read. Check that it is a valid JSON recipe file.');
    } finally {
      event.target.value = '';
    }
  };

  // Auto-detect lat/lng and classification columns
  useEffect(() => {
    const latCol = latitudeOptions.find(c =>
      c.key.toLowerCase().includes('lat') ||
      c.label.toLowerCase().includes('latitude')
    ) || latitudeOptions[0];
    const lngCol = longitudeOptions.find(c =>
      c.key.toLowerCase().includes('lng') ||
      c.key.toLowerCase().includes('lon') ||
      c.label.toLowerCase().includes('longitude')
    ) || longitudeOptions[0];
    const classCol = dataset.columns.find(c =>
      c.key.toLowerCase().includes('case_status') ||
      c.key.toLowerCase().includes('classification') ||
      c.key.toLowerCase() === 'status' ||
      c.key.toLowerCase().includes('severity')
    );
    const stableIdCol = dataset.columns.find(c => {
      const name = `${c.key} ${c.label}`.toLowerCase();
      return name.includes('participant') || name.includes('case_id') || name === 'id id' || /(^|_)id($|_)/.test(c.key);
    });

    if (latCol && !latColumn) setLatColumn(latCol.key);
    if (lngCol && !lngColumn) setLngColumn(lngCol.key);
    if (classCol && !classificationColumn) setClassificationColumn(classCol.key);
    if (stableIdCol && !jitterIdColumn) setJitterIdColumn(stableIdCol.key);
  }, [
    dataset.columns,
    latitudeOptions,
    longitudeOptions,
    latColumn,
    lngColumn,
    classificationColumn,
    jitterIdColumn,
  ]);

  // Process cases with coordinates
  const mapCases: MapCase[] = useMemo(() => {
    if (!latColumn || !lngColumn) return [];

    return dataset.records
      .map(record => {
        const lat = parseCoordinateValue(record[latColumn]);
        const lng = parseCoordinateValue(record[lngColumn]);

        if (lat === null || lng === null) return null;
        if (!isCoordinateInRange(lat, 'lat') || !isCoordinateInRange(lng, 'lng')) return null;
        if (isZeroCoordinatePlaceholder(lat, lng)) return null;

        // Use selected classification field for coloring
        const classification = classificationColumn
          ? String(record[classificationColumn] ?? 'Unknown')
          : 'Unknown';

        // Apply jitter if obfuscation is enabled
        const stableId = jitterIdColumn ? record[jitterIdColumn] : record.id;
        const seed = `${String(stableId ?? record.id)}|${lat}|${lng}|${jitterDistance}`;
        const jittered = obfuscateLocations
          ? jitterCoordinates(lat, lng, jitterDistance, seed)
          : { lat, lng };

        return {
          record,
          lat,
          lng,
          displayLat: jittered.lat,
          displayLng: jittered.lng,
          classification,
        };
      })
      .filter((c): c is MapCase => c !== null);
  }, [dataset.records, latColumn, lngColumn, classificationColumn, obfuscateLocations, jitterDistance, jitterIdColumn]);

  // Apply filters if selected
  const filteredCases = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) {
      return mapCases;
    }

    return mapCases.filter(caseData => {
      const value = String(caseData.record[filterBy] ?? 'Unknown');
      return selectedFilterValues.has(value);
    });
  }, [mapCases, filterBy, selectedFilterValues]);

  // Calculate missing records
  const missingRecordsCount = useMemo(() => {
    if (!latColumn || !lngColumn) return 0;
    return dataset.records.length - mapCases.length;
  }, [dataset.records.length, mapCases.length, latColumn, lngColumn]);

  // Get unique classification values for legend (use filteredCases so legend reflects active filters)
  const classificationValues = useMemo(() => {
    const values = new Set(filteredCases.map(c => c.classification));
    return Array.from(values).sort();
  }, [filteredCases]);

  const orderedClassificationValues = useMemo(() => {
    const visible = new Set(classificationValues);
    const ordered = categoryOrder.filter(value => visible.has(value));
    const remaining = classificationValues.filter(value => !ordered.includes(value));
    return [...ordered, ...remaining];
  }, [categoryOrder, classificationValues]);

  useEffect(() => {
    setCategoryOrder(previous => {
      const present = new Set(classificationValues);
      const next = [
        ...previous.filter(value => present.has(value)),
        ...classificationValues.filter(value => !previous.includes(value)),
      ];
      return arraysEqual(previous, next) ? previous : next;
    });
  }, [classificationValues]);

  const hasRedGreenPairing = useMemo(() => {
    const colors = orderedClassificationValues.map(value =>
      getMarkerColor(value, colorScheme, orderedClassificationValues, customCategoryColors).toLowerCase()
    );
    const hasRed = colors.some(color => ['#dc2626', '#ef4444', '#cc3311'].includes(color));
    const hasGreen = colors.some(color => ['#22c55e', '#10b981', '#009988'].includes(color));
    return hasRed && hasGreen;
  }, [orderedClassificationValues, colorScheme, customCategoryColors]);

  const moveCategory = (value: string, direction: -1 | 1) => {
    setCategoryOrder(previous => {
      const base = orderedClassificationValues.length > 0 ? orderedClassificationValues : previous;
      const next = [...base];
      const index = next.indexOf(value);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= next.length) return previous;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  // Get unique values for the filter dropdown
  const filterValues = useMemo(() => {
    if (!filterBy) return [];
    const values = new Set(dataset.records.map(r => String(r[filterBy] ?? 'Unknown')));
    return Array.from(values).sort();
  }, [dataset.records, filterBy]);

  // Reset selected filter values when filter variable changes
  useEffect(() => {
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
  }, [filterBy]);

  // Map tile URLs
  const tileUrls: Record<Exclude<MapStyle, 'none'>, { url: string; attribution: string }> = {
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    quiet: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri',
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenTopoMap',
    },
  };

  // Default center (US)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const defaultZoom = 4;
  const activeMapStyle: MapStyle = isExporting && exportBaseMap !== 'current' ? exportBaseMap : mapStyle;

  // Info icon component with tooltip (appears below to avoid cutoff)
  const InfoTooltip = ({ text, link }: { text: string; link?: string }) => (
    <span className="relative group inline-flex ml-1">
      <span className="cursor-help text-gray-400 hover:text-gray-600">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span className="absolute top-full left-0 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-56 z-50 pointer-events-none">
        {text}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-gray-300 hover:text-gray-200 pointer-events-auto underline"
            onClick={(e) => e.stopPropagation()}
          >
            Learn more about coordinates
          </a>
        )}
        <span className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
      </span>
    </span>
  );

  // Determine which filter values to show
  const visibleFilterValues = showAllFilterValues ? filterValues : filterValues.slice(0, 5);
  const hasMoreFilterValues = filterValues.length > 5;

  return (
    <div ref={containerRef} className={`h-full flex flex-col lg:flex-row ${isResizing ? 'select-none' : ''}`}>
      {/* Left Panel - Controls */}
      <div
        className="w-full lg:w-auto flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto max-h-[40vh] lg:max-h-none"
        style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? panelWidth : undefined }}
      >
        <div className="space-y-4">
          {/* TabHeader */}
          <TabHeader
            title="Spot Map"
            description="Map case locations using latitude/longitude and optional case status styling."
          />

          {/* Case count summary */}
          <div className="text-sm text-gray-600 pb-3 border-b border-gray-200">
            <span className="font-medium">{filteredCases.length}</span> of {mapCases.length} cases mapped
          </div>

          {/* Filter By */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              Filter By
              <InfoTooltip text="Select which records to include on the map. Use this to show only specific groups (e.g., confirmed cases, certain age groups)." />
            </label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None (show all)</option>
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>

            {/* Filter value checkboxes */}
            {filterBy && filterValues.length > 0 && (
              <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Select values:</span>
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
                <div className="space-y-1">
                  {visibleFilterValues.map(value => {
                    const count = mapCases.filter(c => String(c.record[filterBy] ?? 'Unknown') === value).length;
                    return (
                      <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFilterValues.has(value)}
                          onChange={(e) => {
                            const newSet = new Set(selectedFilterValues);
                            if (e.target.checked) {
                              newSet.add(value);
                            } else {
                              newSet.delete(value);
                            }
                            setSelectedFilterValues(newSet);
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-gray-700 truncate flex-1">{value}</span>
                        <span className="text-gray-400 text-xs">({count})</span>
                      </label>
                    );
                  })}
                </div>
                {hasMoreFilterValues && (
                  <button
                    onClick={() => setShowAllFilterValues(!showAllFilterValues)}
                    className="mt-2 text-xs text-gray-600 hover:text-gray-900"
                  >
                    {showAllFilterValues ? 'Show less' : `Show ${filterValues.length - 5} more...`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Latitude */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              Latitude
              <InfoTooltip
                text="Select the variable that contains latitude values (north-south position, -90 to 90)."
                link="https://gisgeography.com/latitude-longitude-coordinates/"
              />
            </label>
            <select
              value={latColumn}
              onChange={(e) => setLatColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select variable...</option>
              {latitudeOptions.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            {latitudeOptions.some(col => col.type !== 'number') && (
              <p className="text-xs text-gray-500 mt-1">Text fields are included when most values look like coordinates.</p>
            )}
          </div>

          {/* Longitude */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              Longitude
              <InfoTooltip
                text="Select the variable that contains longitude values (east-west position, -180 to 180)."
                link="https://gisgeography.com/latitude-longitude-coordinates/"
              />
            </label>
            <select
              value={lngColumn}
              onChange={(e) => setLngColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select variable...</option>
              {longitudeOptions.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            {longitudeOptions.some(col => col.type !== 'number') && (
              <p className="text-xs text-gray-500 mt-1">Text fields are included when most values look like coordinates.</p>
            )}
          </div>

          {/* Coordinate QA */}
          {latColumn && lngColumn && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-800">Coordinate QA</h3>
                {coordinateQA.excludedRecords.length > 0 && (
                  <button
                    onClick={exportExcludedRecordsCSV}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    Download excluded
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-gray-500">Total records</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.totalRecords}</div>
                <div className="text-gray-500">Valid coordinates</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.validCoordinates}</div>
                <div className="text-gray-500">Missing latitude</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.missingLatitude}</div>
                <div className="text-gray-500">Missing longitude</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.missingLongitude}</div>
                <div className="text-gray-500">Out of range</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.outOfRange}</div>
                <div className="text-gray-500">Likely swapped</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.likelySwapped}</div>
                <div className="text-gray-500">Zero placeholders</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.zeroPlaceholders}</div>
                <div className="text-gray-500">Duplicate coordinates</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.duplicateCoordinates}</div>
                <div className="text-gray-500">Low precision</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.lowPrecision}</div>
              </div>
              {coordinateQA.likelySwapped > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Some records look like latitude and longitude may be reversed. Review before interpreting the map.
                </p>
              )}
              {coordinateQA.lowPrecision > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Low-precision coordinates can blur clusters and small road-segment patterns.
                </p>
              )}
            </div>
          )}

          {/* Classification Variable */}
          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
              Classification Variable (for coloring)
              <InfoTooltip text="Select the variable to use for color-coding markers (e.g., case status, classification). This determines the colors shown on the map when using classification-based color schemes." />
            </label>
            <select
              value={classificationColumn}
              onChange={(e) => setClassificationColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None (all same color)</option>
              {dataset.columns.filter(c => c.type !== 'date').map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

          {/* Privacy Controls */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-3">Privacy Settings</label>

            <div className="space-y-3">
              {/* Obfuscation Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={obfuscateLocations}
                  onChange={(e) => setObfuscateLocations(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Obfuscate locations (recommended)</span>
              </label>

              {/* Jitter Distance Selector */}
              {obfuscateLocations && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Jitter distance: {jitterDistance}m
                  </label>
                  <select
                    value={jitterDistance}
                    onChange={(e) => setJitterDistance(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value={200}>200 meters</option>
                    <option value={500}>500 meters</option>
                    <option value={1000}>1 kilometer</option>
                    <option value={2000}>2 kilometers</option>
                  </select>
                </div>
              )}

              {obfuscateLocations && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Stable ID for repeatable jitter
                  </label>
                  <select
                    value={jitterIdColumn}
                    onChange={(e) => setJitterIdColumn(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Use imported row ID</option>
                    {dataset.columns.map(col => (
                      <option key={col.key} value={col.key}>{col.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Use a stable case or participant ID so re-imported data jitter the same way.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Jittered maps should not be used for exact household, road-segment, or small-neighborhood interpretation.
              </p>
            </div>
          </div>

          {/* Advanced Options */}
          <AdvancedOptions>
            {/* Map Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Title</label>
              <input
                type="text"
                value={mapTitle}
                onChange={(e) => setMapTitle(e.target.value)}
                placeholder="e.g., Confirmed Legionellosis Cases by Residence"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </div>

            {/* Map Caption */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
              <input
                type="text"
                value={mapCaption}
                onChange={(e) => setMapCaption(e.target.value)}
                placeholder="e.g., City Name, State — January 1-31, 2025 (N=47)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              />
            </div>

            {/* Popup Fields */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Popup Fields</label>
              <div className="max-h-40 overflow-auto border border-gray-200 rounded-lg bg-white p-2 space-y-1">
                {dataset.columns.map(col => (
                  <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={popupColumns.includes(col.key)}
                      onChange={(e) => {
                        setPopupColumns(previous => {
                          if (e.target.checked) return [...previous, col.key];
                          return previous.filter(key => key !== col.key);
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-700 truncate">{col.label}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => setPopupColumns(getDefaultPopupColumns(dataset.columns))}
                className="mt-2 text-xs text-blue-600 hover:text-blue-700"
              >
                Reset suggested fields
              </button>
            </div>

            {/* North Arrow Toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNorthArrow}
                  onChange={(e) => setShowNorthArrow(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Show north arrow</span>
              </label>
            </div>

            {/* Clustering Toggle */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableClustering}
                  onChange={(e) => setEnableClustering(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Cluster overlapping points</span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">Groups nearby points at low zoom levels</p>
            </div>

            {/* Color Scheme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
              <select
                value={colorScheme}
                onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="default">Default Blue</option>
                <option value="classification">By Classification</option>
                <option value="colorblind">Colorblind-Friendly</option>
                <option value="sequential">Sequential</option>
              </select>
            </div>

            {orderedClassificationValues.length > 0 && colorScheme !== 'default' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category Colors and Legend Order</label>
                <div className="space-y-2">
                  {orderedClassificationValues.map((value, index) => (
                    <div key={value} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={getMarkerColor(value, colorScheme, orderedClassificationValues, customCategoryColors)}
                        onChange={(e) => setCustomCategoryColors(previous => ({ ...previous, [value]: e.target.value }))}
                        className="w-10 h-8 p-0 border border-gray-300 rounded"
                        aria-label={`Color for ${value}`}
                      />
                      <span className="flex-1 text-sm text-gray-700 truncate">{value}</span>
                      <button
                        onClick={() => moveCategory(value, -1)}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                        title="Move up"
                      >
                        ^
                      </button>
                      <button
                        onClick={() => moveCategory(value, 1)}
                        disabled={index === orderedClassificationValues.length - 1}
                        className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40"
                        title="Move down"
                      >
                        v
                      </button>
                    </div>
                  ))}
                </div>
                {hasRedGreenPairing && (
                  <p className="text-xs text-amber-700 mt-2">
                    This palette includes red and green together. Consider using orange/red plus blue/gray for better accessibility.
                  </p>
                )}
              </div>
            )}

            {/* Map Style */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Style</label>
              <select
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value as MapStyle)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet publication map</option>
                <option value="street">Street</option>
                <option value="satellite">Satellite</option>
                <option value="topo">Topographic</option>
                <option value="none">No base map</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Quiet and no-base options work best for slides and reports. Street works well for transport routes; satellite helps environmental exposures.
              </p>
            </div>

            {/* Export Preset */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export Preset</label>
              <select
                value={exportPreset}
                onChange={(e) => setExportPreset(e.target.value as ExportPreset)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {Object.entries(exportPresets).map(([value, preset]) => (
                  <option key={value} value={value}>{preset.label}</option>
                ))}
              </select>
            </div>

            {/* Export Base Map */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export Base Map</label>
              <select
                value={exportBaseMap}
                onChange={(e) => setExportBaseMap(e.target.value as ExportBaseMap)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet publication map</option>
                <option value="none">No base map</option>
                <option value="current">Same as current view</option>
              </select>
            </div>

            {/* Marker Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marker Size <span className="text-gray-400 font-normal">({markerSize}px)</span>
              </label>
              <input
                type="range"
                min="4"
                max="20"
                value={markerSize}
                onChange={(e) => setMarkerSize(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Map Recipe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Map Recipe</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={saveMapRecipe}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Save recipe
                </button>
                <button
                  onClick={() => recipeInputRef.current?.click()}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Load recipe
                </button>
              </div>
              <input
                ref={recipeInputRef}
                type="file"
                accept="application/json,.json"
                onChange={loadMapRecipe}
                className="hidden"
              />
            </div>
          </AdvancedOptions>

          {/* Help Panel */}
          <HelpPanel title="Tutorial: Spot Maps">
            <SpotMapTutorial />
          </HelpPanel>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="hidden lg:flex w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize flex-shrink-0 items-center justify-center group transition-colors"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-0.5 h-8 bg-gray-400 group-hover:bg-gray-600 rounded-full transition-colors" />
      </div>

      {/* Right Panel - Map */}
      <div className="flex-1 relative min-h-[400px] lg:min-h-0">
        {latColumn && lngColumn ? (
          <div ref={mapContainerRef} className="h-full w-full relative">
            {/* Map Title Overlay */}
            {mapTitle && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] max-w-lg pointer-events-none">
                <div className="bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                  <h2 className="text-sm font-semibold text-gray-900 text-center">{mapTitle}</h2>
                </div>
              </div>
            )}

            {/* Privacy Warning Banner */}
            {obfuscateLocations && (
              <div className={`absolute ${mapTitle ? 'top-16' : 'top-4'} left-1/2 -translate-x-1/2 z-[1000] max-w-lg`}>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 shadow-lg">
                  <p className="text-xs text-amber-900">
                    <span className="font-semibold">Privacy notice:</span> Map locations are jittered by {jitterDistance}m for display. Do not interpret as exact household locations.
                    {missingRecordsCount > 0 && (
                      <span className="block mt-1 text-amber-800">
                        {missingRecordsCount} record{missingRecordsCount !== 1 ? 's' : ''} missing lat/lon coordinates.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Privacy Risk Warning (when obfuscation disabled) */}
            {!obfuscateLocations && (
              <div className={`absolute ${mapTitle ? 'top-16' : 'top-4'} left-1/2 -translate-x-1/2 z-[1000] max-w-lg`}>
                <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 shadow-lg">
                  <p className="text-xs text-red-900">
                    <span className="font-semibold">Privacy Risk:</span> Displaying exact locations may allow re-identification of individuals. Consider enabling location obfuscation before sharing this map.
                    {missingRecordsCount > 0 && (
                      <span className="block mt-1 text-red-800">
                        {missingRecordsCount} record{missingRecordsCount !== 1 ? 's' : ''} missing lat/lon coordinates.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* North Arrow */}
            {showNorthArrow && (
              <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg pointer-events-none">
                <svg width="24" height="32" viewBox="0 0 24 32">
                  <polygon points="12,0 4,28 12,22 20,28" fill="#374151" />
                  <text x="12" y="18" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">N</text>
                </svg>
              </div>
            )}

            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              style={{ height: '100%', width: '100%' }}
            >
              {activeMapStyle !== 'none' && (
                <TileLayer
                  url={tileUrls[activeMapStyle].url}
                  attribution={tileUrls[activeMapStyle].attribution}
                  opacity={activeMapStyle === 'quiet' ? 0.35 : 1}
                  crossOrigin="anonymous"
                />
              )}
              <ScaleControl position="bottomleft" imperial={true} metric={true} />

              {filteredCases.length > 0 && <FitBounds cases={filteredCases} />}

              {enableClustering ? (
                <MarkerClusterGroup
                  chunkedLoading
                  showCoverageOnHover={false}
                >
                  {filteredCases.map((caseData, index) => (
                    <CircleMarker
                      key={caseData.record.id || index}
                      center={[caseData.displayLat, caseData.displayLng]}
                      radius={markerSize}
                      pathOptions={{
                        fillColor: getMarkerColor(caseData.classification, colorScheme, orderedClassificationValues, customCategoryColors),
                        fillOpacity: 0.7,
                        color: '#fff',
                        weight: 1,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold mb-2">Case Details</p>
                          {dataset.columns.filter(col => popupColumns.includes(col.key)).map(col => {
                            const value = caseData.record[col.key];
                            if (value === null || value === undefined) return null;
                            return (
                              <p key={col.key} className="text-gray-600">
                                <span className="font-medium">{col.label}:</span> {String(value)}
                              </p>
                            );
                          })}
                          {!obfuscateLocations && (
                            <p className="text-gray-500 mt-2 text-xs">
                              Coordinates: {caseData.lat.toFixed(4)}, {caseData.lng.toFixed(4)}
                            </p>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MarkerClusterGroup>
              ) : (
                filteredCases.map((caseData, index) => (
                  <CircleMarker
                    key={caseData.record.id || index}
                    center={[caseData.displayLat, caseData.displayLng]}
                    radius={markerSize}
                    pathOptions={{
                      fillColor: getMarkerColor(caseData.classification, colorScheme, orderedClassificationValues, customCategoryColors),
                      fillOpacity: 0.7,
                      color: '#fff',
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold mb-2">Case Details</p>
                        {dataset.columns.filter(col => popupColumns.includes(col.key)).map(col => {
                          const value = caseData.record[col.key];
                          if (value === null || value === undefined) return null;
                          return (
                            <p key={col.key} className="text-gray-600">
                              <span className="font-medium">{col.label}:</span> {String(value)}
                            </p>
                          );
                        })}
                        {!obfuscateLocations && (
                          <p className="text-gray-500 mt-2 text-xs">
                            Coordinates: {caseData.lat.toFixed(4)}, {caseData.lng.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))
              )}
            </MapContainer>

            {/* Map Caption Overlay */}
            {mapCaption && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] max-w-lg pointer-events-none">
                <div className="bg-white/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                  <p className="text-xs text-gray-700 text-center">{mapCaption}</p>
                </div>
              </div>
            )}

            {/* Legend Overlay */}
            {orderedClassificationValues.length > 0 && colorScheme !== 'default' && (
              <div className={`absolute ${mapCaption ? 'bottom-16' : 'bottom-4'} left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000]`}>
                <p className="text-xs font-semibold text-gray-700 mb-2">Legend</p>
                <div className="space-y-1">
                  {orderedClassificationValues.map(value => (
                    <div key={value} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getMarkerColor(value, colorScheme, orderedClassificationValues, customCategoryColors) }}
                      />
                      <span className="text-xs text-gray-700">{value}</span>
                      <span className="text-xs text-gray-400">
                        ({filteredCases.filter(c => c.classification === value).length})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Export Status */}
            {(exportStatus || exportError) && (
              <div className="map-export-exclude absolute top-4 right-4 z-[1100] max-w-sm">
                <div className={`${exportError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'} border rounded-lg px-3 py-2 shadow-lg`}>
                  <p className="text-xs">{exportError || exportStatus}</p>
                </div>
              </div>
            )}

            {/* Results Actions - Export */}
            {latColumn && lngColumn && mapCases.length > 0 && !isExporting && (
              <div className="map-export-exclude absolute bottom-4 right-4 z-[1000]">
                <ResultsActions
                  className="mt-0 pt-0 border-t-0 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-2"
                  actions={[
                    {
                      label: isExporting ? 'Exporting...' : 'Export PNG',
                      onClick: exportMap,
                      icon: ExportIcons.image,
                      disabled: isExporting,
                      variant: 'primary',
                    },
                    {
                      label: 'Export Dataset CSV',
                      onClick: exportDatasetCSV,
                      icon: ExportIcons.csv,
                      variant: 'secondary',
                    },
                    {
                      label: 'Export GeoJSON',
                      onClick: exportGeoJSON,
                      icon: ExportIcons.download,
                      variant: 'secondary',
                    },
                  ]}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center p-8">
              <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-lg text-gray-500">Select Latitude and Longitude</p>
              <p className="text-sm text-gray-400 mt-1">
                Choose the variables containing coordinate data
              </p>
            </div>
          </div>
        )}

        {/* No coordinates warning overlay */}
        {latColumn && lngColumn && mapCases.length === 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg">
            <p className="text-sm text-yellow-800">
              No valid coordinates found. Latitude must be -90 to 90, longitude -180 to 180.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
