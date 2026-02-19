import { useState } from 'react';
import type { Dataset } from '../../types/analysis';

interface DatasetSummaryProps {
  dataset: Dataset;
}

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  number: { label: 'Numeric', color: 'bg-blue-100 text-blue-700' },
  text: { label: 'Text', color: 'bg-gray-100 text-gray-700' },
  categorical: { label: 'Category', color: 'bg-purple-100 text-purple-700' },
  date: { label: 'Date', color: 'bg-green-100 text-green-700' },
  boolean: { label: 'Boolean', color: 'bg-amber-100 text-amber-700' },
};

export function DatasetSummary({ dataset }: DatasetSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const numericCount = dataset.columns.filter(c => c.type === 'number').length;
  const categoricalCount = dataset.columns.filter(c => c.type === 'categorical' || c.type === 'text').length;
  const dateCount = dataset.columns.filter(c => c.type === 'date').length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{dataset.name}</h3>
            <p className="text-xs text-gray-500">
              {dataset.records.length} records · {dataset.columns.length} columns
              <span className="text-gray-300 mx-1">|</span>
              {numericCount} numeric · {categoricalCount} categorical · {dateCount} date
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-4">
          <div className="flex flex-wrap gap-2">
            {dataset.columns.map(col => {
              const badge = TYPE_BADGES[col.type] || TYPE_BADGES.text;
              return (
                <span
                  key={col.key}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                >
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="text-gray-700">{col.label}</span>
                </span>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Choose a chart type below. Numeric columns work with bar, line, slope, bullet, and dot plots.
            Categorical columns pair well with heatmaps, waffle charts, and paired bar charts.
          </p>
        </div>
      )}
    </div>
  );
}
