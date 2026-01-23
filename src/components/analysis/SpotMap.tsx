import { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import html2canvas from 'html2canvas';
import type { Dataset, CaseRecord } from '../../types/analysis';
import 'leaflet/dist/leaflet.css';
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
  classification: string;
}

// Color palettes - all schemes now use case classification
const colorPalettes: Record<ColorScheme, Record<string, string>> = {
  default: {
    'Confirmed': '#3B82F6',
    'Probable': '#3B82F6',
    'Suspected': '#3B82F6',
    'Not a case': '#3B82F6',
    'Unknown': '#3B82F6',
    _default: '#3B82F6',
  },
  classification: {
    'Confirmed': '#DC2626',
    'Probable': '#F59E0B',
    'Suspected': '#3B82F6',
    'Not a case': '#22C55E',
    'Unknown': '#9CA3AF',
    _default: '#6B7280',
  },
  colorblind: {
    'Confirmed': '#CC3311',
    'Probable': '#EE7733',
    'Suspected': '#0077BB',
    'Not a case': '#009988',
    'Unknown': '#BBBBBB',
    _default: '#BBBBBB',
  },
  sequential: {
    'Confirmed': '#99000d',
    'Probable': '#fc9272',
    'Suspected': '#fee5d9',
    'Not a case': '#f0f0f0',
    'Unknown': '#f0f0f0',
    _default: '#f0f0f0',
  },
};

function getMarkerColor(classification: string, scheme: ColorScheme): string {
  const palette = colorPalettes[scheme];
  return palette[classification] || palette._default;
}

// Component to fit map bounds
function FitBounds({ cases }: { cases: MapCase[] }) {
  const map = useMap();

  useEffect(() => {
    if (cases.length > 0) {
      const bounds = cases.map(c => [c.lat, c.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [cases, map]);

  return null;
}

export function SpotMap({ dataset }: SpotMapProps) {
  const [latColumn, setLatColumn] = useState<string>('');
  const [lngColumn, setLngColumn] = useState<string>('');
  const [filterBy, setFilterBy] = useState<string>('');
  const [selectedFilterValues, setSelectedFilterValues] = useState<Set<string>>(new Set());
  const [colorScheme, setColorScheme] = useState<ColorScheme>('classification');
  const [markerSize, setMarkerSize] = useState<number>(8);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite' | 'topo'>('street');
  const [showAllFilterValues, setShowAllFilterValues] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

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

  // Auto-detect lat/lng columns
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

    if (latCol && !latColumn) setLatColumn(latCol.key);
    if (lngCol && !lngColumn) setLngColumn(lngCol.key);
  }, [dataset.columns, latColumn, lngColumn]);

  // Process cases with coordinates
  const mapCases: MapCase[] = useMemo(() => {
    if (!latColumn || !lngColumn) return [];

    return dataset.records
      .map(record => {
        const lat = Number(record[latColumn]);
        const lng = Number(record[lngColumn]);

        if (isNaN(lat) || isNaN(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        // Use case_status or classification field for coloring
        const classification = String(record['case_status'] ?? record['classification'] ?? 'Unknown');

        return {
          record,
          lat,
          lng,
          classification,
        };
      })
      .filter((c): c is MapCase => c !== null);
  }, [dataset.records, latColumn, lngColumn]);

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

          {/* Advanced Options */}
          <AdvancedOptions>
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
            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url={tileUrls[mapStyle].url}
                attribution={tileUrls[mapStyle].attribution}
              />

              {filteredCases.length > 0 && <FitBounds cases={filteredCases} />}

              {filteredCases.map((caseData, index) => (
                <CircleMarker
                  key={caseData.record.id || index}
                  center={[caseData.lat, caseData.lng]}
                  radius={markerSize}
                  pathOptions={{
                    fillColor: getMarkerColor(caseData.classification, colorScheme),
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
                      <p className="text-gray-500 mt-2 text-xs">
                        Coordinates: {caseData.lat.toFixed(4)}, {caseData.lng.toFixed(4)}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {/* Legend Overlay */}
            {classificationValues.length > 0 && colorScheme !== 'default' && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000]">
                <p className="text-xs font-semibold text-gray-700 mb-2">Legend</p>
                <div className="space-y-1">
                  {classificationValues.map(value => (
                    <div key={value} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getMarkerColor(value, colorScheme) }}
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

            {/* Results Actions - Export PNG */}
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
