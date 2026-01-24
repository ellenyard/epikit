import { useState, useMemo } from 'react';
import type { Dataset } from '../../types/analysis';
import { calculateDescriptiveStats, calculateFrequency } from '../../utils/statistics';
import type { DescriptiveStats, FrequencyItem } from '../../utils/statistics';

interface VariableExplorerProps {
  dataset: Dataset;
  onBuildTable: (varKey: string) => void;
  onRunTwoByTwo: (varKey: string) => void;
  // Optional controlled state for persistence
  selectedVar?: string;
  onSelectedVarChange?: (varKey: string) => void;
}

interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  label: string;
}

/**
 * VariableExplorer: Single-variable exploration with histogram, frequency table, and statistics
 */
export function VariableExplorer({
  dataset,
  onBuildTable,
  onRunTwoByTwo,
  selectedVar: controlledSelectedVar,
  onSelectedVarChange,
}: VariableExplorerProps) {
  // Use controlled state if provided, otherwise use local state
  const [internalSelectedVar, setInternalSelectedVar] = useState<string>('');
  const selectedVar = controlledSelectedVar !== undefined ? controlledSelectedVar : internalSelectedVar;
  const setSelectedVar = onSelectedVarChange || setInternalSelectedVar;

  const [binWidth, setBinWidth] = useState<number | null>(null);
  const [showRecodeModal, setShowRecodeModal] = useState(false);

  const selectedColumn = dataset.columns.find(c => c.key === selectedVar);

  // Get all values for the selected variable
  const values = useMemo(() => {
    if (!selectedVar) return [];
    return dataset.records.map(r => r[selectedVar]);
  }, [dataset.records, selectedVar]);

  // Calculate missing values info
  const missingInfo = useMemo(() => {
    const validValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const missingCount = values.length - validValues.length;
    const missingPct = values.length > 0 ? (missingCount / values.length) * 100 : 0;
    return { missingCount, missingPct, validCount: validValues.length };
  }, [values]);

  // Extract numeric values for numeric variables
  const numericValues = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return [];
    return values
      .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
      .map(v => Number(v));
  }, [values, selectedColumn]);

  // Calculate descriptive statistics for numeric variables
  const numericStats: DescriptiveStats | null = useMemo(() => {
    if (!selectedColumn || selectedColumn.type !== 'number') return null;
    return calculateDescriptiveStats(numericValues);
  }, [numericValues, selectedColumn]);

  // Calculate default bin width using Sturges' rule
  const defaultBinWidth = useMemo(() => {
    if (!numericStats || numericValues.length === 0) return 1;
    const range = numericStats.max - numericStats.min;
    if (range === 0) return 1;
    // Sturges' rule for number of bins: k = ceil(log2(n) + 1)
    const numBins = Math.ceil(Math.log2(numericValues.length) + 1);
    const width = range / numBins;
    // Round to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(width)));
    const normalized = width / magnitude;
    let niceWidth;
    if (normalized <= 1) niceWidth = 1;
    else if (normalized <= 2) niceWidth = 2;
    else if (normalized <= 5) niceWidth = 5;
    else niceWidth = 10;
    return niceWidth * magnitude;
  }, [numericStats, numericValues]);

  // Use user-defined bin width or default
  const effectiveBinWidth = binWidth !== null ? binWidth : defaultBinWidth;

  // Calculate histogram bins
  const histogramBins: HistogramBin[] = useMemo(() => {
    if (!numericStats || numericValues.length === 0 || effectiveBinWidth <= 0) return [];

    const min = numericStats.min;
    const max = numericStats.max;
    const bins: HistogramBin[] = [];

    // Calculate bin start (round down to bin width)
    const binStart = Math.floor(min / effectiveBinWidth) * effectiveBinWidth;
    const binEnd = Math.ceil(max / effectiveBinWidth) * effectiveBinWidth;

    for (let start = binStart; start < binEnd; start += effectiveBinWidth) {
      const end = start + effectiveBinWidth;
      const count = numericValues.filter(v => v >= start && v < end).length;
      // Handle last bin to include max value
      const adjustedCount = end >= max
        ? numericValues.filter(v => v >= start && v <= end).length
        : count;
      bins.push({
        binStart: start,
        binEnd: end,
        count: adjustedCount,
        label: `${start.toFixed(1)} - ${end.toFixed(1)}`,
      });
    }

    return bins;
  }, [numericStats, numericValues, effectiveBinWidth]);

  const maxBinCount = Math.max(...histogramBins.map(b => b.count), 1);

  // Calculate frequency distribution
  const frequency: FrequencyItem[] = useMemo(() => {
    if (!selectedVar) return [];
    return calculateFrequency(values);
  }, [values, selectedVar]);

  const formatNumber = (n: number, decimals: number = 2): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Variable Explorer</h3>
        <p className="text-sm text-gray-600">
          Quick exploration of individual variables. Understand distributions, identify missing values, and recode if needed.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Variable Selection */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Select Variable</h4>
            <select
              value={selectedVar}
              onChange={(e) => {
                setSelectedVar(e.target.value);
                setBinWidth(null); // Reset bin width when changing variables
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a variable...</option>
              {dataset.columns.map(col => (
                <option key={col.key} value={col.key}>
                  {col.label} ({col.type})
                </option>
              ))}
            </select>
          </div>

          {selectedVar && (
            <>
              {/* Missing Values Alert */}
              <div className={`border rounded-lg p-4 ${
                missingInfo.missingPct > 10
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <h4 className={`text-sm font-semibold mb-2 ${
                  missingInfo.missingPct > 10 ? 'text-amber-900' : 'text-gray-900'
                }`}>
                  Missing Values
                </h4>
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl font-bold ${
                    missingInfo.missingPct > 10 ? 'text-amber-700' : 'text-gray-700'
                  }`}>
                    {missingInfo.missingCount}
                  </span>
                  <span className={`text-sm ${
                    missingInfo.missingPct > 10 ? 'text-amber-600' : 'text-gray-500'
                  }`}>
                    ({missingInfo.missingPct.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowRecodeModal(true)}
                    className="w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 rounded border border-gray-200"
                  >
                    Recode variable...
                  </button>
                  <button
                    onClick={() => onBuildTable(selectedVar)}
                    className="w-full px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 rounded border border-blue-200 font-medium"
                  >
                    Build table with this variable
                  </button>
                  <button
                    onClick={() => onRunTwoByTwo(selectedVar)}
                    className="w-full px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 rounded border border-blue-200 font-medium"
                  >
                    Run 2x2 with this exposure
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Middle: Visualization */}
        <div className="lg:col-span-5 space-y-4">
          {selectedVar ? (
            <>
              {/* Histogram (for numeric variables) */}
              {numericStats && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-gray-900">Histogram</h4>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Bin width:</label>
                      <input
                        type="number"
                        value={binWidth !== null ? binWidth : defaultBinWidth}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setBinWidth(val);
                          }
                        }}
                        step="any"
                        min="0.01"
                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      />
                      {binWidth !== null && (
                        <button
                          onClick={() => setBinWidth(null)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Histogram Chart - Vertical */}
                  {histogramBins.length > 0 && (
                    <div className="flex flex-col">
                      {/* Bars */}
                      <div className="flex items-end justify-between gap-1 h-48 mb-2">
                        {histogramBins.map((bin, index) => (
                          <div key={index} className="flex-1 flex flex-col items-center h-full">
                            <span className="text-xs text-gray-700 font-medium mb-1">
                              {bin.count > 0 ? bin.count : ''}
                            </span>
                            <div className="flex-1 w-full bg-gray-100 rounded-t overflow-hidden flex items-end">
                              <div
                                className="w-full bg-blue-500 transition-all rounded-t"
                                style={{ height: `${(bin.count / maxBinCount) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* X-axis labels */}
                      <div className="flex justify-between gap-1 border-t border-gray-300 pt-2">
                        {histogramBins.map((bin, index) => (
                          <div key={index} className="flex-1 text-center">
                            <span
                              className="text-xs text-gray-600 block truncate"
                              title={bin.label}
                            >
                              {bin.binStart.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {histogramBins.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No data to display</p>
                  )}
                </div>
              )}

              {/* Frequency Table */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-900">Frequency Table</h4>
                  <p className="text-xs text-gray-500">{selectedColumn?.label}</p>
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">N</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">%</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cum %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {frequency.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-900">{item.value}</td>
                          <td className="px-4 py-2 text-gray-900 text-right">{item.count}</td>
                          <td className="px-4 py-2 text-gray-900 text-right">{formatNumber(item.percent, 1)}%</td>
                          <td className="px-4 py-2 text-gray-500 text-right">{formatNumber(item.cumPercent, 1)}%</td>
                        </tr>
                      ))}
                      {missingInfo.missingCount > 0 && (
                        <tr className="bg-amber-50 text-amber-700">
                          <td className="px-4 py-2">(Missing)</td>
                          <td className="px-4 py-2 text-right">{missingInfo.missingCount}</td>
                          <td className="px-4 py-2 text-right">-</td>
                          <td className="px-4 py-2 text-right">-</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-4 py-2 font-medium text-gray-900">Total</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">
                          {frequency.reduce((sum, item) => sum + item.count, 0) + missingInfo.missingCount}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">100%</td>
                        <td className="px-4 py-2 text-right">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="h-96 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-lg mb-1">Select a variable</p>
                <p className="text-sm">Choose from the dropdown to see its distribution</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: Statistics */}
        <div className="lg:col-span-4 space-y-4">
          {selectedVar && numericStats && (
            <>
              {/* Central Tendency */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Central Tendency</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-xl font-bold text-blue-900">{formatNumber(numericStats.mean)}</p>
                    <p className="text-xs text-blue-700">Mean</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xl font-bold text-green-900">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-green-700">Median</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <p className="text-xl font-bold text-purple-900">
                      {numericStats.mode !== null ? formatNumber(numericStats.mode) : '-'}
                    </p>
                    <p className="text-xs text-purple-700">Mode</p>
                  </div>
                </div>
              </div>

              {/* 5-Number Summary */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">5-Number Summary</h4>
                <div className="flex justify-between text-sm mb-3">
                  <div className="text-center">
                    <p className="font-semibold text-gray-900">{formatNumber(numericStats.min)}</p>
                    <p className="text-xs text-gray-500">Min</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900">{formatNumber(numericStats.q1)}</p>
                    <p className="text-xs text-gray-500">Q1</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-blue-600">{formatNumber(numericStats.median)}</p>
                    <p className="text-xs text-gray-500">Median</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900">{formatNumber(numericStats.q3)}</p>
                    <p className="text-xs text-gray-500">Q3</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900">{formatNumber(numericStats.max)}</p>
                    <p className="text-xs text-gray-500">Max</p>
                  </div>
                </div>
                {/* Box plot visualization */}
                <div className="relative h-6 bg-gray-100 rounded">
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

              {/* Dispersion */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Dispersion</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Std Dev</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.stdDev)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Variance</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.variance)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Range</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.range)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">IQR</p>
                    <p className="text-lg font-semibold text-gray-900">{formatNumber(numericStats.iqr)}</p>
                  </div>
                </div>
              </div>

              {/* Counts */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{numericStats.count}</p>
                    <p className="text-xs text-gray-500">Valid</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-amber-600">{numericStats.missing}</p>
                    <p className="text-xs text-gray-500">Missing</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{formatNumber(numericStats.sum, 0)}</p>
                    <p className="text-xs text-gray-500">Sum</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Summary for non-numeric variables */}
          {selectedVar && selectedColumn && selectedColumn.type !== 'number' && (
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
                  <span className="text-sm font-medium text-gray-900">{missingInfo.missingCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recode Modal */}
      {showRecodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Recode Variable</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Coming Soon:</strong> Variable recoding functionality will be available in a future update.
                </p>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 px-3 py-2 text-sm font-medium bg-blue-100 text-blue-700 rounded">Create Groups</button>
                <button className="flex-1 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Fix Values</button>
                <button className="flex-1 px-3 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Custom</button>
              </div>
              <p className="text-sm text-gray-600">Define cut points to create categories:</p>
              <div className="space-y-3 opacity-60">
                <div className="flex items-center gap-3">
                  <input type="text" defaultValue="0-17" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                  <span className="text-gray-500">-&gt;</span>
                  <input type="text" defaultValue="Child" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="text" defaultValue="18-64" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                  <span className="text-gray-500">-&gt;</span>
                  <input type="text" defaultValue="Adult" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="text" defaultValue="65+" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                  <span className="text-gray-500">-&gt;</span>
                  <input type="text" defaultValue="Senior" disabled className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowRecodeModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
