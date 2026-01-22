import React, { useState } from 'react';

export const SpotMapTutorial: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-gray-900">How to Use This Tool</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 py-4 bg-white border-t border-gray-200">
          <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">What is a Spot Map?</h4>
            <p className="text-sm text-gray-700">
              A spot map is a geographic visualization showing the spatial distribution of cases. It helps identify
              clustering patterns, potential exposure sites, and the geographic spread of disease during an outbreak
              investigation.
            </p>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">Creating Your Spot Map</h4>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">1.</span>
                <div>
                  <strong>Select Latitude and Longitude Variables:</strong> Choose the variables containing geographic
                  coordinates. Coordinates should be in decimal degrees format (e.g., 41.6639, -83.5552). Ensure
                  latitude is between -90 and 90, and longitude is between -180 and 180.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">2.</span>
                <div>
                  <strong>Choose Color Variable (Optional):</strong> Select a categorical variable to color-code your
                  markers (e.g., case status, exposure type, or age group). This helps identify patterns within
                  subgroups.
                </div>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-gray-600 mr-2 mt-0.5">3.</span>
                <div>
                  <strong>Interact with the Map:</strong> Use zoom and pan controls to explore spatial patterns. Click
                  on markers to view case details. Look for clustering that might suggest common exposure sites.
                </div>
              </li>
            </ol>
          </div>

          <div className="mt-4">
            <h4 className="font-semibold text-gray-800 mb-3">What to Look For</h4>
            <div className="space-y-3 text-sm text-gray-700">
              <div className="flex items-start">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-green-900">Spatial Clustering:</strong> Tight groupings of cases may indicate
                  a common exposure site nearby (e.g., restaurant, water source, or contaminated facility).
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-blue-900">Linear Patterns:</strong> Cases arranged along a line might suggest
                  exposure along a route (e.g., water distribution system, food delivery route).
                </div>
              </div>
              <div className="flex items-start">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2 mt-2"></div>
                <div>
                  <strong className="text-purple-900">Outliers:</strong> Cases far from the main cluster may represent
                  different exposure routes or secondary transmission events.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-gray-900 mb-2">Privacy & Mapping Warnings</h5>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li>
                    <strong>• Never use exact home addresses:</strong> Use only de-identified or aggregated locations
                    to protect privacy.
                  </li>
                  <li>
                    <strong>• Apply coordinate jittering:</strong> For sensitive data, add small random offsets to
                    coordinates (e.g., ±0.001°) to obscure exact locations while preserving patterns.
                  </li>
                  <li>
                    <strong>• Use area-level aggregation:</strong> Consider mapping by ZIP code, census tract, or
                    neighborhood instead of individual points for small outbreaks.
                  </li>
                  <li>
                    <strong>• Suppress small cells:</strong> Don't display individual markers if only 1-4 cases exist
                    in an area—this could enable re-identification.
                  </li>
                  <li>
                    <strong>• Be cautious when sharing:</strong> Screenshots of maps with precise coordinates can
                    compromise privacy even if names are removed.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <h5 className="font-semibold text-gray-900 mb-1">Pro Tips</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>• Combine spot maps with epi curves to understand both temporal and spatial patterns</li>
                  <li>• Overlay suspected exposure sites (restaurants, water sources) if coordinates are available</li>
                  <li>• Use different colors for confirmed vs. probable vs. suspected cases</li>
                  <li>• Consider creating separate maps for different time periods to show outbreak progression</li>
                </ul>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
};
