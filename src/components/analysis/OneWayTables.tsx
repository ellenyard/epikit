import React, { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateFrequency } from '../../utils/statistics';
import type { FrequencyItem } from '../../utils/statistics';

interface OneWayTablesProps {
  dataset: Dataset;
}

interface VariableFrequency {
  variable: string;
  label: string;
  frequencies: FrequencyItem[];
  totalCount: number;
  missingCount: number;
}

export function OneWayTables({ dataset }: OneWayTablesProps) {
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [showPercents, setShowPercents] = useState<boolean>(true);
  const [showCumulative, setShowCumulative] = useState<boolean>(false);
  const [showMissing, setShowMissing] = useState<boolean>(true);

  // Filter columns suitable for frequency tables
  const availableColumns = useMemo(() => {
    return dataset.columns.filter(col => {
      // Exclude ID fields and coordinate fields
      if (col.key === 'id' || col.key === 'case_id' || col.key === 'participant_id') return false;
      if (col.key.includes('latitude') || col.key.includes('longitude')) return false;

      // Include all other columns - let user decide what makes sense
      return true;
    });
  }, [dataset]);

  // Calculate frequencies for all selected variables
  const variableFrequencies: VariableFrequency[] = useMemo(() => {
    if (selectedVariables.length === 0) return [];

    return selectedVariables.map(varKey => {
      const column = dataset.columns.find(c => c.key === varKey);
      const values = dataset.records.map(r => r[varKey]);
      const frequencies = calculateFrequency(values);

      const totalCount = frequencies.reduce((sum, item) => sum + item.count, 0);
      const missingCount = dataset.records.length - totalCount;

      return {
        variable: varKey,
        label: column?.label || varKey,
        frequencies,
        totalCount,
        missingCount,
      };
    });
  }, [dataset, selectedVariables]);

  // Toggle variable selection
  const toggleVariable = (varKey: string) => {
    setSelectedVariables(prev => {
      if (prev.includes(varKey)) {
        return prev.filter(v => v !== varKey);
      } else {
        return [...prev, varKey];
      }
    });
  };

  const formatNumber = (n: number, decimals: number = 1): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">One-Way Tables</h3>
        <p className="text-sm text-gray-600 mb-4">
          Create frequency distributions for multiple variables. Useful for creating "Table 1" style demographic summaries.
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-blue-900 mb-3">Variable Selection</h4>
          <p className="text-xs text-gray-600 mb-3">
            Select one or more variables to include in the table
          </p>
          <div className="flex flex-wrap gap-2">
            {availableColumns.map(col => {
              const isSelected = selectedVariables.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleVariable(col.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className={`w-4 h-4 flex items-center justify-center rounded ${
                    isSelected ? 'bg-blue-500' : 'bg-gray-200'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                  {col.label}
                  <span className="text-xs opacity-75">({col.type})</span>
                </button>
              );
            })}
          </div>
          {selectedVariables.length > 0 && (
            <div className="mt-3 text-sm text-blue-800">
              {selectedVariables.length} variable{selectedVariables.length !== 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Display Options */}
        {selectedVariables.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-blue-900 mb-3">Display Options</h4>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPercents}
                  onChange={(e) => setShowPercents(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show percentages</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCumulative}
                  onChange={(e) => setShowCumulative(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show cumulative %</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMissing}
                  onChange={(e) => setShowMissing(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Show missing values</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      {variableFrequencies.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">Frequency Distribution</h4>
            <p className="text-xs text-gray-500">{dataset.records.length} total records</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variable</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">N</th>
                  {showPercents && (
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                  )}
                  {showCumulative && (
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cum %</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {variableFrequencies.map((varFreq, varIndex) => (
                  <React.Fragment key={varFreq.variable}>
                    {/* Variable header row */}
                    <tr className="bg-gray-100">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900" colSpan={2 + (showPercents ? 1 : 0) + (showCumulative ? 1 : 0)}>
                        {varFreq.label}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500" colSpan={1 + (showPercents ? 1 : 0) + (showCumulative ? 1 : 0)}>
                        {varFreq.totalCount} responses
                        {varFreq.missingCount > 0 && showMissing && ` (${varFreq.missingCount} missing)`}
                      </td>
                    </tr>

                    {/* Value rows */}
                    {varFreq.frequencies.map((item, freqIndex) => (
                      <tr key={`${varFreq.variable}-${freqIndex}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-400"></td>
                        <td className="px-4 py-2 text-sm text-gray-900">{item.value}</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">{item.count}</td>
                        {showPercents && (
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatNumber(item.percent)}%</td>
                        )}
                        {showCumulative && (
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">{formatNumber(item.cumPercent)}%</td>
                        )}
                      </tr>
                    ))}

                    {/* Missing row */}
                    {showMissing && varFreq.missingCount > 0 && (
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-400"></td>
                        <td className="px-4 py-2 text-sm text-gray-500 italic">Missing</td>
                        <td className="px-4 py-2 text-sm text-gray-500 text-right">{varFreq.missingCount}</td>
                        {showPercents && (
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">
                            {formatNumber((varFreq.missingCount / dataset.records.length) * 100)}%
                          </td>
                        )}
                        {showCumulative && (
                          <td className="px-4 py-2 text-sm text-gray-500 text-right">-</td>
                        )}
                      </tr>
                    )}

                    {/* Blank row between variables (except last) */}
                    {varIndex < variableFrequencies.length - 1 && (
                      <tr className="h-2">
                        <td colSpan={3 + (showPercents ? 1 : 0) + (showCumulative ? 1 : 0)} className="bg-gray-50"></td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>

              {/* Footer with total */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900" colSpan={2}>
                    Total Records
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right" colSpan={1 + (showPercents ? 1 : 0) + (showCumulative ? 1 : 0)}>
                    {dataset.records.length}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {selectedVariables.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0v10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2z" />
          </svg>
          <p className="text-sm">Select one or more variables to create a frequency table</p>
        </div>
      )}
    </div>
  );
}
