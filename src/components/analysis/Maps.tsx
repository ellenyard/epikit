import { useState } from 'react';
import type { Dataset } from '../../types/analysis';
import { AreaMap } from './AreaMap';
import { SpotMap } from './SpotMap';

interface MapsProps {
  dataset: Dataset;
  datasets: Dataset[];
}

type MapMode = 'spot' | 'area';

export function Maps({ dataset, datasets }: MapsProps) {
  const [mode, setMode] = useState<MapMode>('spot');

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-1">
          <button
            onClick={() => setMode('spot')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'spot'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Spot Map
          </button>
          <button
            onClick={() => setMode('area')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'area'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Area Map
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === 'spot' ? (
          <SpotMap dataset={dataset} />
        ) : (
          <AreaMap dataset={dataset} datasets={datasets} />
        )}
      </div>
    </div>
  );
}
