import { useState, useMemo, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, ScaleControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import type { Dataset, CaseRecord, DataColumn } from '../../types/analysis';
import {
  buildSpotMapExport,
  createJitterSecret,
  findWithheldColumns,
  isJitterSecret,
  jitterCoordinates,
  jitterMinimumDistance,
  jitterSeed,
  normalizeJitterDistance,
} from '../../utils/geoPrivacy';
import {
  analyzeCoordinateQuality,
  isPlausibleCoordinateColumn,
  suggestCoordinateColumns,
} from '../../utils/coordinates';
import { basemaps, FIT_MAX_ZOOM, MAP_MAX_ZOOM } from '../../utils/basemaps';
import type { BasemapId } from '../../utils/basemaps';
import { canvasToPngBlob, captureMapCanvas, downloadBlob, downloadText } from '../../utils/mapExport';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { SpotMapTutorial } from '../tutorials/SpotMapTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';
import { exportToCSV } from '../../utils/csvParser';
import { useLocale } from '../../contexts/LocaleContext';
import { categoryValue, collectCategoryValues } from '../../utils/recordFilter';

interface SpotMapProps {
  dataset: Dataset;
}

type ColorScheme = 'default' | 'classification' | 'colorblind' | 'sequential';
type MapStyle = BasemapId | 'none';

interface MapCase {
  record: CaseRecord;
  lat: number;
  lng: number;
  displayLat: number;  // Jittered coordinates for display
  displayLng: number;
  classification: string;
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

const spotMapExportScale = 2;

// Known case status colors used when values match epidemiological terminology.
// Confirmed, probable and suspected match the epi curve's "by classification"
// scheme. "Not a case" was green, which next to the red of "Confirmed" is the
// one pairing a red-green colour-blind reader cannot separate, and it was the
// default. Non-cases are now slate, which also lets the cases stand out.
const caseStatusColors: Record<string, string> = {
  'Confirmed': '#DC2626',
  'Probable': '#F59E0B',
  'Suspected': '#3B82F6',
  'Not a case': '#475569',
  'Unknown': '#CBD5E1',
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

/**
 * Popup fields to start with.
 *
 * The suggestions used to prefer anything named "location" and then fill up
 * from the first columns of the dataset, which is where a name and the
 * coordinates themselves usually are. Columns that locate or identify someone
 * are never suggested; the user can still tick them.
 */
function getDefaultPopupColumns(columns: DataColumn[], neverSuggest: Set<string>): string[] {
  const preferredPatterns = [
    /(^|_)id($|_)/,
    /date/,
    /status|classification|case/,
    /outcome|severity|severe/,
  ];

  const candidates = columns.filter(col => !neverSuggest.has(col.key));
  const preferred = candidates.filter(col => {
    const name = `${col.key} ${col.label}`.toLowerCase();
    return preferredPatterns.some(pattern => pattern.test(name));
  });

  const keys = preferred.map(col => col.key);
  for (const col of candidates) {
    if (keys.length >= 6) break;
    if (!keys.includes(col.key)) keys.push(col.key);
  }

  return keys.slice(0, 6);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The jitter secret for each dataset, for browsers where storage is refused.
// Without it every remount would draw a new secret and the points would move
// each time the Spot Map tab was reopened.
const sessionJitterSecrets = new Map<string, string>();

// Component to fit map bounds
function FitBounds({ cases }: { cases: MapCase[] }) {
  const map = useMap();

  useEffect(() => {
    if (cases.length > 0) {
      const bounds = cases.map(c => [c.displayLat, c.displayLng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: FIT_MAX_ZOOM });
    }
  }, [cases, map]);

  return null;
}

// Component to keep the Leaflet size in sync with the resizable panel layout
function MapSizeInvalidator({ panelWidth }: { panelWidth: number }) {
  const map = useMap();

  useEffect(() => {
    const timeout = window.setTimeout(() => map.invalidateSize(), 100);
    return () => window.clearTimeout(timeout);
  }, [map, panelWidth]);

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

  // Discard persisted column keys that no longer exist in this dataset
  const validSavedColumn = (value: unknown): string => {
    const key = typeof value === 'string' ? value : '';
    return key && dataset.columns.some(col => col.key === key) ? key : '';
  };

  // The coordinate columns to start with. A saved pair is kept only if it is
  // still believable: an earlier version chose the first numeric column for
  // both axes, and that choice was saved in the browsers of everyone who
  // opened the map on a dataset without coordinates.
  const [initialCoordinates] = useState(() => {
    const savedLat = validSavedColumn(saved.latColumn);
    const savedLng = validSavedColumn(saved.lngColumn);
    const plausible = (key: string, axis: 'lat' | 'lng') => {
      const column = dataset.columns.find(col => col.key === key);
      return column !== undefined && isPlausibleCoordinateColumn(column, dataset.records, axis);
    };
    if (savedLat && savedLng && savedLat !== savedLng && plausible(savedLat, 'lat') && plausible(savedLng, 'lng')) {
      return { lat: savedLat, lng: savedLng };
    }
    return suggestCoordinateColumns(dataset.columns, dataset.records);
  });

  // State initialized from localStorage
  const [latColumn, setLatColumn] = useState<string>(initialCoordinates.lat);
  const [lngColumn, setLngColumn] = useState<string>(initialCoordinates.lng);
  const [classificationColumn, setClassificationColumn] = useState<string>(() => validSavedColumn(saved.classificationColumn));
  const [filterBy, setFilterBy] = useState<string>(() => validSavedColumn(saved.filterBy));
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(() => {
    const arr = saved.selectedFilterValues;
    return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
  });
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => (saved.colorScheme as ColorScheme) || 'classification');
  const [markerSize, setMarkerSize] = useState<number>(() => (saved.markerSize as number) ?? 8);
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    const style = saved.mapStyle;
    return style === 'none' || (typeof style === 'string' && style in basemaps) ? style as MapStyle : 'street';
  });
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportError, setExportError] = useState<string>('');
  // True once any tile of the current base map has failed to load.
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [customCategoryColors, setCustomCategoryColors] = useState<Record<string, string>>(() => {
    return isObjectRecord(saved.customCategoryColors) ? saved.customCategoryColors as Record<string, string> : {};
  });
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    const arr = saved.categoryOrder;
    return Array.isArray(arr) ? arr as string[] : [];
  });
  const [popupColumns, setPopupColumns] = useState<string[]>(() => {
    const arr = saved.popupColumns;
    return Array.isArray(arr) ? arr as string[] : [];
  });
  // Whether the popup fields are still the suggested ones. Suggestions depend
  // on which columns turn out to be sensitive, so they are filled in below.
  const [popupColumnsChosen, setPopupColumnsChosen] = useState<boolean>(() => Array.isArray(saved.popupColumns));

  // Privacy safeguards
  const [obfuscateLocations, setObfuscateLocations] = useState<boolean>(() => saved.obfuscateLocations !== undefined ? saved.obfuscateLocations as boolean : true);
  const [jitterDistance, setJitterDistance] = useState<number>(() => normalizeJitterDistance(saved.jitterDistance));
  // The secret the jitter is seeded from. It is saved with this dataset's map
  // settings, and so travels in a project file alongside the true coordinates
  // it protects, which keeps a colleague's copy of the map identical. It is
  // never written to a recipe, a CSV, a GeoJSON file or an image.
  const [jitterSecret] = useState<string>(() => {
    const secret = isJitterSecret(saved.jitterSecret)
      ? saved.jitterSecret
      : sessionJitterSecrets.get(dataset.id) ?? createJitterSecret();
    sessionJitterSecrets.set(dataset.id, secret);
    return secret;
  });

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
        jitterSecret,
        mapTitle,
        mapCaption,
        showNorthArrow,
        enableClustering,
        filterBy,
        selectedFilterValues: Array.from(selectedFilterValues),
        customCategoryColors,
        categoryOrder,
        // Suggested fields are not saved, so they are worked out afresh if the
        // dataset's columns change.
        ...(popupColumnsChosen ? { popupColumns } : {}),
      };
      localStorage.setItem(persistenceKey, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save spot map settings:', e);
    }
  }, [persistenceKey, latColumn, lngColumn, classificationColumn, colorScheme, markerSize,
    mapStyle, obfuscateLocations, jitterDistance, jitterSecret, mapTitle, mapCaption, showNorthArrow,
    enableClustering, filterBy, selectedFilterValues, customCategoryColors,
    categoryOrder, popupColumns, popupColumnsChosen]);

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
    dataset.columns.filter(col => isPlausibleCoordinateColumn(col, dataset.records, 'lat'))
  ), [dataset.columns, dataset.records]);

  const longitudeOptions = useMemo(() => (
    dataset.columns.filter(col => isPlausibleCoordinateColumn(col, dataset.records, 'lng'))
  ), [dataset.columns, dataset.records]);

  // One column cannot be both axes, and plotting it against itself draws a
  // diagonal line of points that looks like a result.
  const sameColumnForBoth = latColumn !== '' && latColumn === lngColumn;
  const coordinatesChosen = latColumn !== '' && lngColumn !== '' && !sameColumnForBoth;

  const coordinateQA = useMemo(() => (
    analyzeCoordinateQuality(
      dataset.records,
      coordinatesChosen ? latColumn : '',
      coordinatesChosen ? lngColumn : '',
      dataset.columns
    )
  ), [dataset.records, dataset.columns, latColumn, lngColumn, coordinatesChosen]);

  // Columns that would give a location or a person away beside a jittered
  // point: other coordinate fields, names, phone numbers, addresses.
  const withheldColumns = useMemo(() => (
    findWithheldColumns(dataset.columns, dataset.records, latColumn, lngColumn, coordinateQA.usable)
  ), [dataset.columns, dataset.records, latColumn, lngColumn, coordinateQA.usable]);

  // What a popup may not show while locations are obfuscated. The selected
  // coordinate columns are on this list too: they hold the true position.
  const hiddenWhenObfuscated = useMemo(() => (
    new Set([...withheldColumns.map(col => col.key), latColumn, lngColumn].filter(Boolean))
  ), [withheldColumns, latColumn, lngColumn]);

  const suggestedPopupColumns = useMemo(() => (
    getDefaultPopupColumns(dataset.columns, hiddenWhenObfuscated)
  ), [dataset.columns, hiddenWhenObfuscated]);

  const activePopupColumns = useMemo(() => {
    const validKeys = new Set(dataset.columns.map(col => col.key));
    const chosen = popupColumnsChosen ? popupColumns.filter(key => validKeys.has(key)) : [];
    return chosen.length > 0 ? chosen : suggestedPopupColumns;
  }, [dataset.columns, popupColumns, popupColumnsChosen, suggestedPopupColumns]);

  const popupDisplayColumns = useMemo(() => (
    dataset.columns.filter(col =>
      activePopupColumns.includes(col.key) && !(obfuscateLocations && hiddenWhenObfuscated.has(col.key))
    )
  ), [dataset.columns, activePopupColumns, obfuscateLocations, hiddenWhenObfuscated]);

  const withheldNote = obfuscateLocations && withheldColumns.length > 0
    ? ` Withheld because they could reveal a location or a person: ${withheldColumns.map(col => col.label).join(', ')}.`
    : '';

  const showExportStatus = (message: string) => {
    setExportStatus(message);
    setExportError('');
    // Long enough to read a list of withheld columns.
    window.setTimeout(() => setExportStatus(current => (current === message ? '' : current)), withheldNote ? 12000 : 4000);
  };

  // Export map as PNG
  const exportMap = async () => {
    const exportElement = mapContainerRef.current;
    if (!exportElement) return;

    setIsExporting(true);
    setExportError('');
    setExportStatus('');
    try {
      const canvas = await captureMapCanvas(exportElement, { scale: spotMapExportScale });
      downloadBlob(await canvasToPngBlob(canvas), `spot-map-${new Date().toISOString().split('T')[0]}.png`);
      showExportStatus('PNG downloaded.');
    } catch (error) {
      console.error('Failed to export map:', error);
      setExportError(
        'PNG export did not finish. Try another map style, then export again. If it still fails, use GeoJSON/CSV export or a browser screenshot as a fallback.'
      );
      setExportStatus('');
    } finally {
      setIsExporting(false);
    }
  };

  // When locations are obfuscated the exported rows must carry the jittered
  // coordinates, not the originals, and nothing else that gives the position
  // away. This is the data behind a map the user has chosen to publish with
  // locations protected.
  const buildExport = () => buildSpotMapExport({
    cases: filteredCases,
    columns: dataset.columns,
    latColumn,
    lngColumn,
    obfuscate: obfuscateLocations,
    jitterDistance,
    withheldKeys: withheldColumns.map(col => col.key),
  });

  const exportPrivacyNote = () => obfuscateLocations
    ? ` Coordinates are jittered (${jitterMinimumDistance(jitterDistance)}–${jitterDistance} m).${withheldNote}`
    : ' Coordinates are exact.';

  // Export filtered dataset as CSV
  const exportDatasetCSV = () => {
    if (filteredCases.length === 0) return;

    try {
      const { columns, records } = buildExport();
      const csv = exportToCSV(columns, records, { localeConfig });
      downloadText(csv, `spot_map_data_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
      showExportStatus(`CSV downloaded.${exportPrivacyNote()}`);
    } catch (error) {
      console.error('Failed to export CSV:', error);
      setExportError('The CSV file could not be created.');
    }
  };

  const exportExcludedRecordsCSV = () => {
    if (coordinateQA.excludedRecords.length === 0) return;

    const columns: DataColumn[] = [
      ...dataset.columns,
      { key: '_map_exclusion_reason', label: 'Map Exclusion Reason', type: 'text' },
    ];
    const csv = exportToCSV(columns, coordinateQA.excludedRecords, { localeConfig });
    downloadText(csv, `spot_map_excluded_records_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
  };

  const exportGeoJSON = () => {
    if (filteredCases.length === 0) return;

    try {
      const { geojson } = buildExport();
      downloadText(
        JSON.stringify(geojson, null, 2),
        `spot_map_points_${new Date().toISOString().split('T')[0]}.geojson`,
        'application/geo+json'
      );
      showExportStatus(`GeoJSON downloaded.${exportPrivacyNote()}`);
    } catch (error) {
      console.error('Failed to export GeoJSON:', error);
      setExportError('The GeoJSON file could not be created.');
    }
  };

  const saveMapRecipe = () => {
    // A recipe is passed around without the data, so it carries the settings
    // and never the jitter secret.
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
      mapTitle,
      mapCaption,
      showNorthArrow,
      enableClustering,
      popupColumns: activePopupColumns,
    };

    downloadText(JSON.stringify(recipe, null, 2), `${dataset.name || 'spot-map'}_recipe.json`, 'application/json');
  };

  const loadMapRecipe = async (event: ChangeEvent<HTMLInputElement>) => {
    const recipeFile = event.target.files?.[0];
    if (!recipeFile) return;

    try {
      const recipe = JSON.parse(await recipeFile.text()) as unknown;
      if (!isObjectRecord(recipe) || recipe.module !== 'spot-map') {
        setExportError('This file is not a LineList spot map recipe.');
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
      if (recipe.mapStyle === 'none' || (typeof recipe.mapStyle === 'string' && recipe.mapStyle in basemaps)) {
        setMapStyle(recipe.mapStyle as MapStyle);
        setBasemapFailed(false);
      }
      if (typeof recipe.obfuscateLocations === 'boolean') setObfuscateLocations(recipe.obfuscateLocations);
      // Only the distances the map offers. A recipe carrying 0 would otherwise
      // show exact locations under a notice saying they were jittered.
      if (typeof recipe.jitterDistance === 'number') setJitterDistance(normalizeJitterDistance(recipe.jitterDistance));
      if (typeof recipe.mapTitle === 'string') setMapTitle(recipe.mapTitle);
      if (typeof recipe.mapCaption === 'string') setMapCaption(recipe.mapCaption);
      if (typeof recipe.showNorthArrow === 'boolean') setShowNorthArrow(recipe.showNorthArrow);
      if (typeof recipe.enableClustering === 'boolean') setEnableClustering(recipe.enableClustering);
      if (Array.isArray(recipe.popupColumns)) {
        setPopupColumns(recipe.popupColumns.filter(value => typeof value === 'string' && validKeys.has(value)));
        setPopupColumnsChosen(true);
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

  // Auto-detect the classification column. Coordinate columns are chosen once,
  // at mount, and only when the dataset convincingly has them.
  useEffect(() => {
    const classCol = dataset.columns.find(c =>
      c.key.toLowerCase().includes('case_status') ||
      c.key.toLowerCase().includes('classification') ||
      c.key.toLowerCase() === 'status' ||
      c.key.toLowerCase().includes('severity')
    );

    if (classCol && !classificationColumn) setClassificationColumn(classCol.key);
  }, [dataset.columns, classificationColumn]);

  // The records that can be mapped, with the position each is drawn at
  const mapCases: MapCase[] = useMemo(() => (
    coordinateQA.usable.map(({ record, lat, lng }) => {
      // Use selected classification field for coloring
      const classification = classificationColumn
        ? categoryValue(record[classificationColumn])
        : 'Unknown';

      // Apply jitter if obfuscation is enabled
      const jittered = obfuscateLocations
        ? jitterCoordinates(lat, lng, jitterDistance, jitterSeed(jitterSecret, lat, lng, jitterDistance))
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
  ), [coordinateQA.usable, classificationColumn, obfuscateLocations, jitterDistance, jitterSecret]);

  // Apply filters if selected
  const filteredCases = useMemo(() => {
    if (!filterBy || selectedFilterValues.size === 0) {
      return mapCases;
    }

    return mapCases.filter(caseData => {
      const value = categoryValue(caseData.record[filterBy]);
      return selectedFilterValues.has(value);
    });
  }, [mapCases, filterBy, selectedFilterValues]);

  // Records left off the map because their coordinates are missing or unusable
  const missingRecordsCount = coordinatesChosen ? dataset.records.length - mapCases.length : 0;
  const filteredOutCount = mapCases.length - filteredCases.length;

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
    return collectCategoryValues(dataset.records, filterBy);
  }, [dataset.records, filterBy]);

  // Columns a map can be filtered or coloured by: a limited set of values, so
  // not dates, measurements, coordinates or record IDs. The pickers used to
  // list every column, with the ID first.
  const groupingColumns = useMemo(
    () => dataset.columns.filter(c =>
      c.type !== 'date' && c.type !== 'number'
      && collectCategoryValues(dataset.records, c.key).length <= 30
    ),
    [dataset.columns, dataset.records]
  );

  // Reset selected filter values when filter variable changes (skip the initial
  // run so persisted selections survive a reload)
  const filterResetSkipped = useRef(false);
  useEffect(() => {
    if (!filterResetSkipped.current) {
      filterResetSkipped.current = true;
      return;
    }
    setSelectedFilterValues(new Set());
    setShowAllFilterValues(false);
  }, [filterBy]);

  // Default center (US)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const defaultZoom = 4;
  const activeMapStyle: MapStyle = mapStyle;

  // One popup for both the clustered and the plain markers. While locations
  // are obfuscated it shows no field that holds, or could stand in for, the
  // true position.
  const renderPopup = (caseData: MapCase) => (
    // Pan the popup clear of the privacy banner at the top of the map, which
    // used to cover the top of a popup for any point in the north of the map.
    <Popup autoPanPaddingTopLeft={[20, mapTitle ? 160 : 100]} autoPanPaddingBottomRight={[20, 70]}>
      <div className="text-sm">
        <p className="font-semibold mb-2">Record Details</p>
        {popupDisplayColumns.map(col => {
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
  );

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

          {/* Record count summary. "Records", not "cases": a line list usually
              holds people who turned out not to be cases as well. */}
          <div className="text-sm text-gray-600 pb-3 border-b border-gray-200">
            <span className="font-medium">{filteredCases.length}</span> of {dataset.records.length} records mapped
            {(missingRecordsCount > 0 || filteredOutCount > 0) && (
              <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
                {missingRecordsCount > 0 && (
                  <li>{missingRecordsCount} not mapped: coordinates missing or unusable</li>
                )}
                {filteredOutCount > 0 && (
                  <li>{filteredOutCount} hidden by the filter</li>
                )}
              </ul>
            )}
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
              {groupingColumns.map(col => (
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
                    const count = mapCases.filter(c => categoryValue(c.record[filterBy]) === value).length;
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
            {sameColumnForBoth && (
              <p className="text-xs text-amber-700 mt-1">
                Latitude and longitude are set to the same variable. Choose a different variable for one of them.
              </p>
            )}
          </div>

          {/* Coordinate QA */}
          {coordinatesChosen && (
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
                <div className="text-gray-500">Could not be read</div>
                <div className="text-right font-medium text-gray-800">{coordinateQA.unparseable}</div>
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
              {coordinateQA.columnsLookSwapped && (
                <p className="mt-2 text-xs text-amber-700">
                  The latitude field is named like a longitude and the longitude field like a latitude. Check that they are not the wrong way round.
                </p>
              )}
              {coordinateQA.likelySwapped > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {coordinateQA.likelySwapped} record{coordinateQA.likelySwapped !== 1 ? 's look' : ' looks'} as if latitude and longitude are reversed, and {coordinateQA.likelySwapped !== 1 ? 'are' : 'is'} left off the map. Download the excluded records to review them.
                </p>
              )}
              {coordinateQA.unparseable > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  {coordinateQA.unparseable} record{coordinateQA.unparseable !== 1 ? 's have' : ' has'} coordinates that could not be read and {coordinateQA.unparseable !== 1 ? 'are' : 'is'} left off the map.
                  {coordinateQA.combinedValues > 0
                    ? ' Some cells hold latitude and longitude together; split them into two columns.'
                    : ' Use decimal degrees (41.6639) or degrees, minutes and seconds (41°39\'50"N).'}
                </p>
              )}
              {coordinateQA.duplicateCoordinates > 0 && obfuscateLocations && (
                <p className="mt-1 text-xs text-gray-500">
                  Records that share a coordinate are moved together and overlap. Turn on clustering to see how many are at each point.
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
              Colour points by
              <InfoTooltip text="Each value of this column gets its own colour and a legend entry, for example case status or sex." />
            </label>
            <select
              value={classificationColumn}
              onChange={(e) => setClassificationColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">None (all same color)</option>
              {groupingColumns.map(col => (
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
                <span className="text-sm text-gray-700">Jitter locations (recommended)</span>
              </label>
              <p className="text-xs text-gray-500 -mt-1">
                Moves each point a random distance so the map does not show where anyone lives. Exports are jittered too.
              </p>

              {/* Jitter Distance Selector */}
              {obfuscateLocations && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    Jitter distance: up to {jitterDistance}m
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
                  <p className="text-xs text-gray-500 mt-1">
                    Each location is moved between {jitterMinimumDistance(jitterDistance)} m and {jitterDistance} m in a direction that cannot be worked out from the map or its exports.
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-500">
                Jittered maps should not be used for exact household, road-segment, or small-neighborhood interpretation.
              </p>

              {obfuscateLocations && withheldColumns.length > 0 && (
                <div className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg p-2">
                  <p className="font-medium text-gray-700">Withheld from popups and exports</p>
                  <p className="mt-1">
                    {withheldColumns.map(col => col.label).join(', ')}
                  </p>
                  <p className="mt-1 text-gray-500">
                    These variables look like coordinates, addresses, names or contact details, which would undo the jitter. They are left out of the CSV and GeoJSON while locations are obfuscated.
                  </p>
                </div>
              )}
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
                {/* Ticked fields first, so the current popup can be read at a glance. */}
                {[...dataset.columns].sort((a, b) =>
                  Number(activePopupColumns.includes(b.key)) - Number(activePopupColumns.includes(a.key))
                ).map(col => {
                  const hidden = obfuscateLocations && hiddenWhenObfuscated.has(col.key);
                  return (
                    <label key={col.key} className={`flex items-center gap-2 text-sm ${hidden ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={!hidden && activePopupColumns.includes(col.key)}
                        disabled={hidden}
                        onChange={(e) => {
                          setPopupColumns(
                            e.target.checked
                              ? [...activePopupColumns, col.key]
                              : activePopupColumns.filter(key => key !== col.key)
                          );
                          setPopupColumnsChosen(true);
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className={`truncate ${hidden ? 'text-gray-400' : 'text-gray-700'}`}>
                        {col.label}{hidden ? ' (withheld)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
              {obfuscateLocations && hiddenWhenObfuscated.size > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  Withheld variables are not shown in popups while locations are obfuscated.
                </p>
              )}
              <button
                onClick={() => {
                  setPopupColumns([]);
                  setPopupColumnsChosen(false);
                }}
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
                onChange={(e) => {
                  setMapStyle(e.target.value as MapStyle);
                  setBasemapFailed(false);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="quiet">Quiet publication map</option>
                <option value="street">Street</option>
                <option value="none">No base map</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Quiet and no-base options work best for slides and reports. Street works well for transport routes. With no base map, nothing is requested from a map service.
              </p>
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
        {coordinatesChosen ? (
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
                    <span className="font-semibold">Privacy notice:</span> Map locations are jittered by up to {jitterDistance}m for display. Do not interpret as exact household locations.
                    {missingRecordsCount > 0 && (
                      <span className="block mt-1 text-amber-800">
                        {missingRecordsCount} record{missingRecordsCount !== 1 ? 's are' : ' is'} not shown: coordinates missing or unusable.
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
                        {missingRecordsCount} record{missingRecordsCount !== 1 ? 's are' : ' is'} not shown: coordinates missing or unusable.
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
              maxZoom={MAP_MAX_ZOOM}
              style={{ height: '100%', width: '100%' }}
            >
              {/* Keyed by style so each base map is its own layer. Reusing one
                  layer left the previous provider's attribution on the map. */}
              {activeMapStyle !== 'none' && (
                <TileLayer
                  key={activeMapStyle}
                  url={basemaps[activeMapStyle].url}
                  attribution={basemaps[activeMapStyle].attribution}
                  opacity={basemaps[activeMapStyle].opacity}
                  maxZoom={MAP_MAX_ZOOM}
                  maxNativeZoom={basemaps[activeMapStyle].maxNativeZoom}
                  crossOrigin="anonymous"
                  eventHandlers={{
                    tileerror: () => setBasemapFailed(true),
                    tileload: () => setBasemapFailed(false),
                  }}
                />
              )}
              <ScaleControl position="bottomleft" imperial={true} metric={true} />
              <MapSizeInvalidator panelWidth={panelWidth} />

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
                      {renderPopup(caseData)}
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
                    {renderPopup(caseData)}
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
              // bottom-16 keeps the legend clear of the scale bar, which sits in the same corner.
              <div className="absolute bottom-16 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000]">
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

            {/* Base map could not be loaded. Shown on screen only. */}
            {basemapFailed && activeMapStyle !== 'none' && (
              <div className="map-export-exclude absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] max-w-md">
                <div className="bg-white/95 border border-gray-300 rounded-lg px-3 py-2 shadow-lg">
                  <p className="text-xs text-gray-700">
                    The base map could not be loaded. You may be offline, or the map provider may be unavailable. The points are still in the right place; choose "No base map" to export without it.
                  </p>
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
            {mapCases.length > 0 && !isExporting && (
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
              {latitudeOptions.length === 0 && longitudeOptions.length === 0 ? (
                <>
                  <p className="text-lg text-gray-600">No coordinates in this dataset</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md">
                    A spot map needs a latitude and a longitude variable, and none of the variables here look like coordinates. To map counts by district or another named area instead, use the Area Map.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg text-gray-600">Select Latitude and Longitude</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md">
                    {sameColumnForBoth
                      ? 'Latitude and longitude are set to the same variable. Choose a different variable for one of them.'
                      : 'Choose the variables containing coordinate data. They were not selected for you because no pair of variables is clearly a latitude and a longitude.'}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* No coordinates warning overlay */}
        {coordinatesChosen && mapCases.length === 0 && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg">
            <p className="text-sm text-yellow-800">
              No usable coordinates found in these variables. Latitude must be -90 to 90 and longitude -180 to 180, in decimal degrees or degrees, minutes and seconds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
