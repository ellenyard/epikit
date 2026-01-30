import { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, ScaleControl } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import html2canvas from 'html2canvas';
import type { Dataset, CaseRecord } from '../../types/analysis';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { SpotMapTutorial } from '../tutorials/SpotMapTutorial';
import { TabHeader, ResultsActions, ExportIcons, AdvancedOptions, HelpPanel } from '../shared';

interface SpotMapProps {
  dataset: Dataset;
}

type ColorScheme = 'default' | 'classification' | 'colorblind' | 'sequential';

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

// Known case status colors used when values match epidemiological terminology
const caseStatusColors: Record<string, string> = {
  'Confirmed': '#DC2626',
  'Probable': '#F59E0B',
  'Suspected': '#3B82F6',
  'Not a case': '#22C55E',
  'Unknown': '#9CA3AF',
};

function getMarkerColor(classification: string, scheme: ColorScheme, allValues: string[]): string {
  if (scheme === 'default') return '#3B82F6';

  // For classification scheme, use known case status colors when they match
  if (scheme === 'classification') {
    if (caseStatusColors[classification]) return caseStatusColors[classification];
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
  const [latColumn, setLatColumn] = useState<string>('');
  const [lngColumn, setLngColumn] = useState<string>('');
  const [classificationColumn, setClassificationColumn] = useState<string>('');
  const [filterBy, setFilterBy] = useState<string>('');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(new Set());
  const [colorScheme, setColorScheme] = useState<ColorScheme>('classification');
  const [markerSize, setMarkerSize] = useState<number>(8);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite' | 'topo'>('street');
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Privacy safeguards
  const [obfuscateLocations, setObfuscateLocations] = useState<boolean>(true);
  const [jitterDistance, setJitterDistance] = useState<number>(500); // meters

  // Map title and caption
  const [mapTitle, setMapTitle] = useState<string>('');
  const [mapCaption, setMapCaption] = useState<string>('');

  // North arrow
  const [showNorthArrow, setShowNorthArrow] = useState<boolean>(false);

  // Point clustering
  const [enableClustering, setEnableClustering] = useState<boolean>(false);

  // Resizable panel
  const [panelWidth, setPanelWidth] = useState(288); // 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Export map as PNG
  const exportMap = async () => {
    if (!mapContainerRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });

      const link = document.createElement('a');
      link.download = `spot-map-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export map:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Export filtered dataset as CSV
  const exportDatasetCSV = () => {
    if (filteredCases.length === 0) return;

    // Get the records for filtered cases
    const filteredRecords = filteredCases.map(c => c.record);

    // Create CSV
    const headers = dataset.columns.map(col => col.label);
    let csv = headers.join(',') + '\n';

    filteredRecords.forEach(record => {
      const row = dataset.columns.map(col => {
        const value = record[col.key];
        const strValue = value === null || value === undefined ? '' : String(value);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      csv += row.join(',') + '\n';
    });

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

  // Auto-detect lat/lng and classification columns
  useEffect(() => {
    const latCol = dataset.columns.find(c =>
      c.key.toLowerCase().includes('lat') ||
      c.label.toLowerCase().includes('latitude')
    );
    const lngCol = dataset.columns.find(c =>
      c.key.toLowerCase().includes('lng') ||
      c.key.toLowerCase().includes('lon') ||
      c.label.toLowerCase().includes('longitude')
    );
    const classCol = dataset.columns.find(c =>
      c.key.toLowerCase().includes('case_status') ||
      c.key.toLowerCase().includes('classification') ||
      c.key.toLowerCase() === 'status'
    );

    if (latCol && !latColumn) setLatColumn(latCol.key);
    if (lngCol && !lngColumn) setLngColumn(lngCol.key);
    if (classCol && !classificationColumn) setClassificationColumn(classCol.key);
  }, [dataset.columns, latColumn, lngColumn, classificationColumn]);

  // Process cases with coordinates
  const mapCases: MapCase[] = useMemo(() => {
    if (!latColumn || !lngColumn) return [];

    return dataset.records
      .map(record => {
        const lat = Number(record[latColumn]);
        const lng = Number(record[lngColumn]);

        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        // Use selected classification field for coloring
        const classification = classificationColumn
          ? String(record[classificationColumn] ?? 'Unknown')
          : 'Unknown';

        // Apply jitter if obfuscation is enabled
        const seed = String(record.id || record[latColumn] || '') + String(jitterDistance);
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
  }, [dataset.records, latColumn, lngColumn, classificationColumn, obfuscateLocations, jitterDistance]);

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

  // Get unique classification values for legend
  const classificationValues = useMemo(() => {
    const values = new Set(mapCases.map(c => c.classification));
    return Array.from(values).sort();
  }, [mapCases]);

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
  const tileUrls: Record<string, { url: string; attribution: string }> = {
    street: {
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
        className="w-full flex-shrink-0 bg-gray-50 border-b lg:border-b-0 border-gray-200 p-4 overflow-y-auto"
        style={{ width: window.innerWidth >= 1024 ? panelWidth : '100%' }}
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
              {dataset.columns.filter(c => c.type === 'number').map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
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
              {dataset.columns.filter(c => c.type === 'number').map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
          </div>

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

            {/* Map Style */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Map Style</label>
              <select
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value as 'street' | 'satellite' | 'topo')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="street">Street</option>
                <option value="satellite">Satellite</option>
                <option value="topo">Topographic</option>
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
              <TileLayer
                url={tileUrls[mapStyle].url}
                attribution={tileUrls[mapStyle].attribution}
              />
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
                        fillColor: getMarkerColor(caseData.classification, colorScheme, classificationValues),
                        fillOpacity: 0.7,
                        color: '#fff',
                        weight: 1,
                      }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold mb-2">Case Details</p>
                          {dataset.columns.slice(0, 6).map(col => {
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
                      fillColor: getMarkerColor(caseData.classification, colorScheme, classificationValues),
                      fillOpacity: 0.7,
                      color: '#fff',
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold mb-2">Case Details</p>
                        {dataset.columns.slice(0, 6).map(col => {
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
            {classificationValues.length > 0 && colorScheme !== 'default' && (
              <div className={`absolute ${mapCaption ? 'bottom-16' : 'bottom-4'} left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000]`}>
                <p className="text-xs font-semibold text-gray-700 mb-2">Legend</p>
                <div className="space-y-1">
                  {classificationValues.map(value => (
                    <div key={value} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getMarkerColor(value, colorScheme, classificationValues) }}
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

            {/* Results Actions - Export */}
            {latColumn && lngColumn && mapCases.length > 0 && (
              <div className="absolute bottom-4 right-4 z-[1000]">
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
                      label: 'Export Dataset CSV',
                      onClick: exportDatasetCSV,
                      icon: ExportIcons.csv,
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
