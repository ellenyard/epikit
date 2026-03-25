import type { ReactNode } from 'react';
import type { Dataset } from '../../../types/analysis';
import { VariableMapper } from './VariableMapper';

interface FacetWrapperProps {
  dataset: Dataset;
  facetCol: string;
  renderChart: (facetDataset: Dataset, facetLabel: string) => ReactNode;
}

export function FacetWrapper({ dataset, facetCol, renderChart }: FacetWrapperProps) {
  if (!facetCol) {
    return <>{renderChart(dataset, '')}</>;
  }

  // Get unique facet values
  const facetValues = Array.from(
    new Set(
      dataset.records
        .map(r => r[facetCol])
        .filter(v => v != null && v !== '')
        .map(String)
    )
  ).sort();

  if (facetValues.length === 0) {
    return <>{renderChart(dataset, '')}</>;
  }

  // Create filtered datasets
  const facetDatasets = facetValues.map(value => {
    const filteredRecords = dataset.records.filter(r => String(r[facetCol]) === value);
    const facetDataset: Dataset = {
      ...dataset,
      id: `${dataset.id}-facet-${value}`,
      name: `${dataset.name} — ${value}`,
      records: filteredRecords,
    };
    return { value, dataset: facetDataset };
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
          Small Multiples
        </span>
        <span className="text-xs text-gray-500">
          Faceted by {dataset.columns.find(c => c.key === facetCol)?.label || facetCol} ({facetValues.length} panels)
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {facetDatasets.map(({ value, dataset: fd }) => (
          <div key={value} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700">{value}</p>
              <p className="text-xs text-gray-400">{fd.records.length} records</p>
            </div>
            <div className="p-2" style={{ maxHeight: '400px', overflow: 'auto' }}>
              {renderChart(fd, value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FacetControlProps {
  columns: Dataset['columns'];
  value: string;
  onChange: (col: string) => void;
}

export function FacetControl({ columns, value, onChange }: FacetControlProps) {
  return (
    <div className="border-t border-gray-200 pt-3 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        <p className="text-xs font-medium text-purple-700">Small Multiples</p>
      </div>
      <VariableMapper
        label="Facet By"
        description="Split chart into panels by this variable"
        columns={columns}
        value={value}
        onChange={onChange}
        filterTypes={['categorical', 'text']}
        placeholder="None (single chart)"
      />
    </div>
  );
}
