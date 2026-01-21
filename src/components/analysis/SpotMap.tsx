import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { Dataset, CaseRecord } from '../../types/analysis';
import 'leaflet/dist/leaflet.css';

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
  const [showPopups, setShowPopups] = useState(true);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite' | 'topo'>('street');

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

  // Info icon component with tooltip
  const InfoTooltip = ({ text, link }: { text: string; link?: string }) => (
    <span className="relative group inline-flex ml-1">
      <span className="cursor-help text-gray-400 hover:text-gray-600">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-normal w-64 z-50 pointer-events-none">
        {text}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-blue-300 hover:text-blue-200 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            Learn more about coordinates
          </a>
        )}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div className="text-sm text-gray-500">
          {filteredCases.length} of {mapCases.length} cases mapped ({dataset.records.length} total records)
        </div>
      </div>

      {/* Configuration - Row 1: Filter By */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
            Filter By
            <InfoTooltip text="Select which records to include on the map. Use this to show only specific groups (e.g., confirmed cases, certain age groups)." />
          </label>
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">None (show all)</option>
            {dataset.columns.map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Configuration - Row 2: Lat/Long */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
            Latitude Variable
            <InfoTooltip
              text="Select the variable in your dataset that contains latitude values (north-south position, ranging from -90 to 90)."
              link="https://gisgeography.com/latitude-longitude-coordinates/"
            />
          </label>
          <select
            value={latColumn}
            onChange={(e) => setLatColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select variable...</option>
            {dataset.columns.filter(c => c.type === 'number').map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
            Longitude Variable
            <InfoTooltip
              text="Select the variable in your dataset that contains longitude values (east-west position, ranging from -180 to 180)."
              link="https://gisgeography.com/latitude-longitude-coordinates/"
            />
          </label>
          <select
            value={lngColumn}
            onChange={(e) => setLngColumn(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select variable...</option>
            {dataset.columns.filter(c => c.type === 'number').map(col => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Configuration - Row 3: Formatting (Color Scheme, Map Style, Marker Size) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color Scheme</label>
          <select
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="default">Default Blue</option>
            <option value="classification">Classification (Standard)</option>
            <option value="colorblind">Classification (Colorblind-Friendly)</option>
            <option value="sequential">Classification (Sequential)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Map Style</label>
          <select
            value={mapStyle}
            onChange={(e) => setMapStyle(e.target.value as 'street' | 'satellite' | 'topo')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="street">Street</option>
            <option value="satellite">Satellite</option>
            <option value="topo">Topographic</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Marker Size</label>
          <input
            type="range"
            min="4"
            max="20"
            value={markerSize}
            onChange={(e) => setMarkerSize(Number(e.target.value))}
            className="w-full mt-2"
          />
        </div>
      </div>

      {/* Filter Options */}
      {filterBy && filterValues.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">
              Filter by {dataset.columns.find(c => c.key === filterBy)?.label}
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFilterValues(new Set(filterValues))}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedFilterValues(new Set())}
                className="text-xs text-gray-600 hover:text-gray-700"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {filterValues.map(value => {
              const count = mapCases.filter(c => String(c.record[filterBy] ?? 'Unknown') === value).length;
              return (
                <label key={value} className="flex items-center gap-2 text-sm">
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
                  <span className="text-gray-700">{value}</span>
                  <span className="text-gray-500">({count})</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Display Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showPopups}
            onChange={(e) => setShowPopups(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show popups on click
        </label>
      </div>

      {/* Legend - Always show classification values */}
      {classificationValues.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Classification Legend</h4>
          <div className="flex flex-wrap gap-4">
            {classificationValues.map(value => (
              <div key={value} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: getMarkerColor(value, colorScheme) }}
                />
                <span className="text-sm text-gray-700">{value}</span>
                <span className="text-xs text-gray-500">
                  ({filteredCases.filter(c => c.classification === value).length})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map */}
      {latColumn && lngColumn ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ height: '500px' }}>
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
                {showPopups && (
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
                )}
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center text-gray-400">
          <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-lg">Select latitude and longitude columns to display the map</p>
          <p className="text-sm mt-2">
            Your dataset needs columns with numeric coordinate values
          </p>
        </div>
      )}

      {/* No coordinates warning */}
      {latColumn && lngColumn && mapCases.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            No valid coordinates found. Make sure your latitude values are between -90 and 90,
            and longitude values are between -180 and 180.
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Tips</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Click on markers to see case details</li>
          <li>• Use scroll wheel to zoom in/out</li>
          <li>• Drag to pan the map</li>
          <li>• For GPS data collected via EpiKit forms, coordinates will be auto-detected</li>
        </ul>
      </div>
    </div>
  );
}
