import { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateDescriptiveStats, calculateFrequency } from '../../utils/statistics';
import type { DescriptiveStats as DescStats, FrequencyItem } from '../../utils/statistics';

interface DescriptiveStatsProps {
  dataset: Dataset;
}

export function DescriptiveStats({ dataset }: DescriptiveStatsProps) {
  const [selectedVar, setSelectedVar] = useState<string>('');

  const selectedColumn = dataset.columns.find(c => c.key === selectedVar);

  const values = useMemo(() => {
    if (!selectedVar) return [];
    return dataset.records.map(r => r[selectedVar]);
  }, [dataset.records, selectedVar]);

  const numericStats: DescStats | null = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return null;
    const numericValues = values
      .filter(v => v !== null && v !== undefined)
      .map(v => Number(v));
    return calculateDescriptiveStats(numericValues);
  }, [values, selectedColumn]);

  const frequency: FrequencyItem[] = useMemo(() => {
    if (!selectedVar) return [];
    return calculateFrequency(values);
  }, [values, selectedVar]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Descriptive Statistics</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select a variable to see frequency distributions and summary statistics.
        </p>
      </div>

      {/* Variable Selection */}
      <div className="max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Variable</label>
        <select
          value={selectedVar}
          onChange={(e) => setSelectedVar(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select variable...</option>
          {dataset.columns.map(col => (
            <option key={col.key} value={col.key}>
              {col.label} ({col.type})
            </option>
          ))}
        </select>
      </div>

      {selectedVar && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Frequency Distribution */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900">Frequency Distribution</h4>
              <p className="text-xs text-gray-500">{selectedColumn?.label}</p>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cum %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {frequency.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{item.value}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">{item.count}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatNumber(item.percent, 1)}%</td>
                      <td className="px-4 py-2 text-sm text-gray-500 text-right">{formatNumber(item.cumPercent, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">Total</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                      {frequency.reduce((sum, item) => sum + item.count, 0)}
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">100%</td>
                    <td className="px-4 py-2 text-sm text-gray-500 text-right">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Bar Chart Visualization */}
            <div className="p-4 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-500 mb-2">Distribution</p>
              <div className="space-y-1">
                {frequency.slice(0, 10).map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-24 truncate" title={item.value}>
                      {item.value}
                    </span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">
                      {formatNumber(item.percent, 1)}%
                    </span>
                  </div>
                ))}
                {frequency.length > 10 && (
                  <p className="text-xs text-gray-400 mt-2">
                    + {frequency.length - 10} more values
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Summary Statistics (for numeric variables) */}
          {numericStats && (
            <div className="space-y-4">
              {/* Central Tendency */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Central Tendency</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-900">{formatNumber(numericStats.mean)}</p>
                    <p className="text-xs text-blue-700">Mean</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-900">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-green-700">Median</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-900">
                      {numericStats.mode !== null ? formatNumber(numericStats.mode) : '-'}
                    </p>
                    <p className="text-xs text-purple-700">Mode</p>
                  </div>
                </div>
              </div>

              {/* Dispersion */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Dispersion</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Standard Deviation</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.stdDev)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.variance)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Range</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.range)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IQR (Q3 - Q1)</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.iqr)}</p>
                  </div>
                </div>
              </div>

              {/* Quartiles & Range */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Distribution</h4>

                {/* Five Number Summary */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.min)}</p>
                    <p className="text-xs text-gray-500">Min</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q1)}</p>
                    <p className="text-xs text-gray-500">Q1 (25%)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-blue-600">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-gray-500">Median</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.q3)}</p>
                    <p className="text-xs text-gray-500">Q3 (75%)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.max)}</p>
                    <p className="text-xs text-gray-500">Max</p>
                  </div>
                </div>

                {/* Box Plot Visualization */}
                <div className="relative h-8 bg-gray-100 rounded">
                  {numericStats.range > 0 && (
                    <>
                      {/* Whiskers */}
                      <div
                        className="absolute top-1/2 h-0.5 bg-gray-400"
                        style={{
                          left: '0%',
                          right: `${100 - ((numericStats.max - numericStats.min) / numericStats.range) * 100}%`,
                          transform: 'translateY(-50%)',
                        }}
                      />
                      {/* Box */}
                      <div
                        className="absolute top-1 bottom-1 bg-blue-200 border border-blue-400 rounded"
                        style={{
                          left: `${((numericStats.q1 - numericStats.min) / numericStats.range) * 100}%`,
                          right: `${((numericStats.max - numericStats.q3) / numericStats.range) * 100}%`,
                        }}
                      />
                      {/* Median line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
                        style={{
                          left: `${((numericStats.median - numericStats.min) / numericStats.range) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Count Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{numericStats.count}</p>
                    <p className="text-xs text-gray-500">Valid</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{numericStats.missing}</p>
                    <p className="text-xs text-gray-500">Missing</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(numericStats.sum, 0)}</p>
                    <p className="text-xs text-gray-500">Sum</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* For non-numeric variables, show summary */}
          {selectedColumn && selectedColumn.type !== 'number' && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Summary</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Total responses</span>
                  <span className="text-sm font-medium text-gray-900">
                    {frequency.reduce((sum, item) => sum + item.count, 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Unique values</span>
                  <span className="text-sm font-medium text-gray-900">{frequency.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Most common</span>
                  <span className="text-sm font-medium text-gray-900">
                    {frequency[0]?.value || '-'} ({frequency[0]?.count || 0})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Missing</span>
                  <span className="text-sm font-medium text-gray-900">
                    {dataset.records.length - frequency.reduce((sum, item) => sum + item.count, 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedVar && (
        <div className="text-center py-12 text-gray-400">
          <p>Select a variable to view statistics</p>
        </div>
      )}
    </div>
  );
}
